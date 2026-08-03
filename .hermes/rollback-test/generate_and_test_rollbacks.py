#!/usr/bin/env python3
"""
Rollback test for all active migrations in supabase/migrations/ (last 30 days).

Strategy: for each migration file, generate a best-effort "down" script
(structural inverse DDL). Execute the down inside a transaction that is
ALWAYS rolled back (BEGIN; ...; ROLLBACK). Since Postgres DDL is
transactional, nothing persists — the test only proves whether the inverse
DDL can run against the current live schema.

Verdicts:
  PASS                 down ran clean (no CASCADE needed)
  PASS_CASCADE         down needed CASCADE (dependents exist)
  FAIL                 down errored even with CASCADE (isolate culprit stmt)
  MANUAL               migration has data/function-replace/drop ops that
                       cannot be auto-reverted; only notes recorded
"""
import json, re, ssl, sys, time, urllib.request, os

MCP = "https://supabase-mcp.atomicabr.com.br/mcp"
MIG_DIR = r"C:/zapp-web-v3/supabase/migrations"
OUT_DIR = r"C:/zapp-web-v3/.hermes/rollback-test"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

def mcp_call(name, arguments, timeout=180):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                       "params": {"name": name, "arguments": arguments}}).encode()
    req = urllib.request.Request(MCP, data=body, headers={
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream"})
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        data = json.loads(r.read().decode())
    if "error" in data:
        return {"error": data["error"]}
    txt = ""
    for c in data.get("result", {}).get("content", []):
        if c.get("type") == "text":
            txt += c["text"]
    return {"text": txt, "isError": data.get("result", {}).get("isError", False)}

def extract_error(res):
    """Pull the first ERROR message out of an MCP text response."""
    if res.get("error"):
        return json.dumps(res["error"])[:300]
    t = res.get("text", "")
    m = re.search(r'(?:ERROR|error):\s*([^\n"]+)', t)
    if m:
        return m.group(1).strip()[:250]
    m2 = re.search(r'"message"\s*:\s*"([^"]+)"', t)
    if m2:
        return m2.group(1)[:250]
    return t[:200] if t else ""

# ---------------- SQL statement splitter (comment/string/dollar-quote aware)
def split_statements(sql):
    stmts, cur = [], []
    i, n = 0, len(sql)
    in_line = in_block = in_str = False
    in_dollar = None
    while i < n:
        ch, nxt = sql[i], sql[i+1] if i+1 < n else ''
        if in_line:
            cur.append(ch)
            if ch == '\n': in_line = False
            i += 1; continue
        if in_block:
            cur.append(ch)
            if ch == '*' and nxt == '/': cur.append(nxt); i += 2; in_block = False
            else: i += 1
            continue
        if in_str:
            cur.append(ch)
            if ch == "'":
                if nxt == "'": cur.append(nxt); i += 2
                else: in_str = False; i += 1
            else: i += 1
            continue
        if in_dollar is not None:
            cur.append(ch)
            if sql.startswith(in_dollar, i):
                cur.append(in_dollar); i += len(in_dollar); in_dollar = None
            else: i += 1
            continue
        if ch == '-' and nxt == '-': in_line = True; cur.append(ch); i += 1; continue
        if ch == '/' and nxt == '*': in_block = True; cur.append('/*'); i += 2; continue
        if ch == "'": in_str = True; cur.append(ch); i += 1; continue
        if ch == '$':
            m = re.match(r'\$[A-Za-z_0-9]*\$', sql[i:])
            if m: in_dollar = m.group(0); cur.append(in_dollar); i += len(in_dollar); continue
            cur.append(ch); i += 1; continue
        if ch == ';':
            s = ''.join(cur).strip()
            if s: stmts.append(s)
            cur = []; i += 1; continue
        cur.append(ch); i += 1
    s = ''.join(cur).strip()
    if s: stmts.append(s)
    return stmts

# ---------------- object-name / signature helpers
NAME = r'[A-Za-z_][A-Za-z0-9_$]*'
QNAME = rf'(?:"[^"]+"|{NAME})(?:\s*\.\s*(?:"[^"]+"|{NAME}))?'

def bare_name(qn):
    return qn.strip().replace('"', '').split('.')[-1]

def strip_leading_comments(s):
    """Remove full-line comments and leading block comments from a statement."""
    lines = s.split('\n')
    out = []
    for ln in lines:
        if ln.lstrip().startswith('--'):
            continue
        out.append(ln)
    s2 = '\n'.join(out)
    # strip leading block comments (possibly repeated)
    while True:
        t = s2.lstrip()
        if t.startswith('/*'):
            end = t.find('*/')
            if end < 0:
                t = ''
            else:
                t = t[end + 2:]
            s2 = t
        else:
            break
    return s2.strip() or None

def find_matching_paren(s, start):
    """start = index of '('; returns index of matching ')' (string/dollar aware)."""
    depth = 0; i = start; in_str = False; in_dollar = None
    while i < len(s):
        ch, nxt = s[i], s[i+1] if i+1 < len(s) else ''
        if in_dollar is not None:
            if s.startswith(in_dollar, i): in_dollar = None; i += len(in_dollar); continue
            i += 1; continue
        if in_str:
            if ch == "'":
                if nxt == "'": i += 2
                else: in_str = False; i += 1
            else: i += 1
            continue
        if ch == "'": in_str = True; i += 1; continue
        if ch == '$':
            m = re.match(r'\$[A-Za-z_0-9]*\$', s[i:])
            if m: in_dollar = m.group(0); i += len(in_dollar); continue
            i += 1; continue
        if ch == '(': depth += 1
        elif ch == ')':
            depth -= 1
            if depth == 0: return i
        i += 1
    return -1

def clean_arg(arg):
    arg = re.sub(r'--.*$', '', arg, flags=re.M).strip()
    arg = re.sub(r'/\*.*?\*/', '', arg, flags=re.S).strip()
    arg = re.sub(r'\b(IN|OUT|INOUT|VARIADIC)\b', ' ', arg, flags=re.I).strip()
    arg = re.sub(r'\s+DEFAULT\s*.*$', '', arg, flags=re.I).strip()
    # drop trailing "COLLATE ..." / "CONSTRAINT ..." clauses (best-effort)
    arg = re.sub(r'\s+COLLATE\s+\S+.*$', '', arg, flags=re.I).strip()
    if re.fullmatch(r'"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*', arg or ''):
        return None  # bare name without type
    return arg

def split_args(sig):
    """Split parameter list on top-level commas (string/comment aware)."""
    args, cur, depth, in_str, in_dollar, in_line = [], [], 0, False, None, False
    i, n = 0, len(sig)
    while i < n:
        ch, nxt = sig[i], sig[i+1] if i+1 < n else ''
        if in_line:
            if ch == '\n':
                in_line = False
                cur.append(' ')
            i += 1
            continue
        if in_dollar is not None:
            if sig.startswith(in_dollar, i): in_dollar = None; i += len(in_dollar)
            else: i += 1
            continue
        if in_str:
            if ch == "'":
                if nxt == "'": i += 2
                else: in_str = False; i += 1
            else: i += 1
            continue
        if ch == '-' and nxt == '-':
            in_line = True; i += 2; continue
        if ch == "'": in_str = True; i += 1; continue
        if ch == '$':
            m = re.match(r'\$[A-Za-z_0-9]*\$', sig[i:])
            if m: in_dollar = m.group(0); i += len(m.group(0)); continue
            i += 1; continue
        if ch == '(': depth += 1; cur.append(ch); i += 1; continue
        if ch == ')': depth -= 1; cur.append(ch); i += 1; continue
        if ch == ',' and depth == 0:
            args.append(''.join(cur).strip()); cur = []; i += 1; continue
        cur.append(ch); i += 1
    if cur: args.append(''.join(cur).strip())
    return args

def fn_signature(stmt, kw):
    """Extract (name, args) from CREATE [OR REPLACE] FUNCTION/PROCEDURE."""
    m = re.search(rf'CREATE\s+(?:OR\s+REPLACE\s+)?{kw}\s+({QNAME})\s*\(', stmt, re.I)
    if not m: return None, None
    name = m.group(1)
    open_p = m.end() - 1
    close_p = find_matching_paren(stmt, open_p)
    if close_p < 0: return name, None
    raw_args = split_args(stmt[open_p+1:close_p])
    sigs = []
    for a in raw_args:
        a = a.strip()
        if not a: continue
        c = clean_arg(a)
        if c: sigs.append(c)
    if any('...' in c or '…' in c for c in sigs):
        return name, None
    return name, sigs

# ---------------- down generator
def generate_down(fname, stmts):
    B = {k: [] for k in ('event_trigger','policy','trigger','view','matview','function',
                         'column','constraint','index','table','type','sequence',
                         'schema','publication','extension')}
    ORDER = ('event_trigger','policy','trigger','view','matview','function',
             'column','constraint','index','table','type','sequence','schema',
             'publication','extension')
    notes, man = [], []
    for st in stmts:
        s = strip_leading_comments(st)
        if not s:
            continue
        up = s.upper()
        if re.match(r'^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|SET\s|RESET\s|SHOW\s|SELECT\b|NOTIFY\b|LISTEN\b|PERFORM\b|DO\s|\$\$)', up):
            notes.append(("CONTROL/NOOP", s[:90]))
            continue
        m = re.match(rf'CREATE\s+(?:OR\s+REPLACE\s+)?(?:UNLOGGED\s+|TEMPORARY\s+|TEMP\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?({QNAME})\b', up)
        if m:
            B['table'].append(f"DROP TABLE IF EXISTS {m.group(1)};")
            continue
        m = re.match(rf'CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?({QNAME})\s+ON\s+({QNAME})\b', up)
        if m:
            idx, tbl = m.group(1), m.group(2)
            if 'UNIQUE' in up:
                B['constraint'].append(f"ALTER TABLE IF EXISTS {tbl} DROP CONSTRAINT IF EXISTS {idx};")
            B['index'].append(f"DROP INDEX IF EXISTS {idx};")
            continue
        m = re.match(rf'CREATE\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?ON\s+({QNAME})\b', up)
        if m:
            notes.append(("INDEX_UNNAMED", f"auto-named index on {m.group(1)} — check pg_indexes"))
            continue
        m = re.match(rf'ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?({QNAME})\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?({NAME}|"[^"]+")', up)
        if m:
            table = m.group(1)
            cols = re.findall(r'ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_$]*|"[^"]+")', up)
            for c in cols:
                B['column'].append(f"ALTER TABLE IF EXISTS {table} DROP COLUMN IF EXISTS {c};")
            continue
        m = re.match(rf'ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?({QNAME})\s+ADD\s+CONSTRAINT\s+(?:IF\s+NOT\s+EXISTS\s+)?({NAME}|"[^"]+")', up)
        if m:
            cons = re.findall(r'ADD\s+CONSTRAINT\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_$]*|"[^"]+")', up)
            for c in cons:
                B['constraint'].append(f"ALTER TABLE IF EXISTS {m.group(1)} DROP CONSTRAINT IF EXISTS {c};")
            continue
        if re.match(r'ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\S+)\s+ADD\s+(PRIMARY\s+KEY|UNIQUE\b)', up):
            notes.append(("CONSTRAINT_UNNAMED", s[:120]))
            continue
        m = re.match(rf'ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?({QNAME})\s+ALTER\s+COLUMN\s+({NAME}|"[^"]+")\s+SET\s+NOT\s+NULL', up)
        if m:
            B['column'].append(f"ALTER TABLE IF EXISTS {m.group(1)} ALTER COLUMN {m.group(2)} DROP NOT NULL;")
            continue
        m = re.match(rf'ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?({QNAME})\s+ALTER\s+COLUMN\s+({NAME}|"[^"]+")\s+SET\s+DEFAULT\b', up)
        if m:
            B['column'].append(f"ALTER TABLE IF EXISTS {m.group(1)} ALTER COLUMN {m.group(2)} DROP DEFAULT;")
            continue
        m = re.match(rf'ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?({QNAME})\s+ALTER\s+COLUMN\s+({NAME}|"[^"]+")\s+DROP\s+NOT\s+NULL', up)
        if m:
            notes.append(("SET_NOT_NULL", f"{m.group(1)}.{m.group(2)} — down = SET NOT NULL (manual)"))
            continue
        if re.match(r'ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\S+)\s+DROP\s+COLUMN', up):
            notes.append(("DROP_COLUMN", s[:120] + " — down = re-add (def unknown)"))
            continue
        m = re.match(rf'CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP\s+|TEMPORARY\s+)?VIEW\s+({QNAME})\b', up)
        if m:
            B['view'].append(f"DROP VIEW IF EXISTS {m.group(1)};")
            if 'OR REPLACE' in up:
                notes.append(("REPLACE_VIEW", f"{m.group(1)} replaced prior def — restore old def from git history"))
            continue
        m = re.match(rf'CREATE\s+(?:OR\s+REPLACE\s+)?MATERIALIZED\s+VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?({QNAME})\b', up)
        if m:
            B['matview'].append(f"DROP MATERIALIZED VIEW IF EXISTS {m.group(1)};")
            if 'OR REPLACE' in up:
                notes.append(("REPLACE_MVIEW", f"{m.group(1)} replaced prior def — restore old def from git history"))
            continue
        for kw in ("FUNCTION", "PROCEDURE"):
            if re.match(rf'CREATE\s+(?:OR\s+REPLACE\s+)?{kw}\s+({QNAME})\s*\(', up):
                name, sigs = fn_signature(s, kw)
                was_replace = 'OR REPLACE' in up
                if sigs is None:
                    notes.append((f"{kw}_UNPARSED", f"{name}(...) — sig parse failed"))
                else:
                    arglist = ', '.join(sigs) if sigs else ''
                    B['function'].append(f"DROP {kw} IF EXISTS {name}({arglist});")
                    if was_replace:
                        notes.append((f"REPLACE_{kw}", f"{name} replaced prior def — restore old def from git history"))
                break
        else:
            m = re.match(rf'CREATE\s+(?:OR\s+REPLACE\s+)?EVENT\s+TRIGGER\s+({NAME}|"[^"]+")', up)
            if m:
                B['event_trigger'].append(f"DROP EVENT TRIGGER IF EXISTS {m.group(1)};")
                continue
            m = re.match(rf'CREATE\s+(?:OR\s+REPLACE\s+)?POLICY\s+({NAME}|"[^"]+")\s+ON\s+({QNAME})', up)
            if m:
                B['policy'].append(f"DROP POLICY IF EXISTS {m.group(1)} ON {m.group(2)};")
                continue
            m = re.match(rf'CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+({NAME}|"[^"]+")\b', up)
            if m:
                prefix = re.split(r'\b(FOR\s+EACH|FOR\s+STATEMENT|WHEN\s|EXECUTE\s|DO\s)', up)[0]
                tm = list(re.finditer(rf'\bON\s+({QNAME})\b', prefix))
                if tm:
                    B['trigger'].append(f"DROP TRIGGER IF EXISTS {m.group(1)} ON {tm[-1].group(1)};")
                else:
                    notes.append(("TRIGGER_UNPARSED", s[:120]))
                continue
            m = re.match(rf'CREATE\s+(?:OR\s+REPLACE\s+)?TYPE\s+({QNAME})\b', up)
            if m:
                B['type'].append(f"DROP TYPE IF EXISTS {m.group(1)};")
                continue
            m = re.match(rf'CREATE\s+(?:TEMPORARY\s+|TEMP\s+)?SEQUENCE\s+(?:IF\s+NOT\s+EXISTS\s+)?({QNAME})', up)
            if m:
                B['sequence'].append(f"DROP SEQUENCE IF EXISTS {m.group(1)};")
                continue
            m = re.match(rf'CREATE\s+SCHEMA\s+(?:IF\s+NOT\s+EXISTS\s+)?({QNAME})', up)
            if m:
                B['schema'].append(f"DROP SCHEMA IF EXISTS {m.group(1)} CASCADE;")
                continue
            m = re.match(rf'CREATE\s+EXTENSION\s+(?:IF\s+NOT\s+EXISTS\s+)?({NAME})', up)
            if m:
                B['extension'].append(f"DROP EXTENSION IF EXISTS {m.group(1)};")
                continue
            m = re.match(rf'CREATE\s+(?:OR\s+REPLACE\s+)?PUBLICATION\s+({QNAME})', up)
            if m:
                B['publication'].append(f"DROP PUBLICATION IF EXISTS {m.group(1)};")
                continue
            m = re.match(rf'ALTER\s+PUBLICATION\s+({QNAME})\s+ADD\s+TABLE\s+(.+)$', up)
            if m:
                B['publication'].append(f"ALTER PUBLICATION {m.group(1)} DROP TABLE {m.group(2)};")
                continue
            dropped = False
            for kw in ("TABLE", "VIEW", "FUNCTION", "POLICY", "TRIGGER", "TYPE",
                       "SEQUENCE", "INDEX", "EVENT TRIGGER", "MATERIALIZED VIEW",
                       "PROCEDURE", "SCHEMA", "EXTENSION", "PUBLICATION"):
                if re.match(rf'DROP\s+{kw}\s+', up):
                    man.append(f"DROP {kw} {s[:90]} — down = re-create (def in git history)")
                    dropped = True
                    break
            if dropped:
                continue
            if re.match(r'^(UPDATE|INSERT|DELETE|TRUNCATE|COPY|MERGE)\b', up):
                man.append(f"DATA {s[:100]} — down = inverse data op (manual)")
                continue
            if re.match(r'^(GRANT|REVOKE)\b', up):
                man.append(f"PRIV {s[:100]} — down = reverse grant (manual)")
                continue
            if re.match(r'^COMMENT\s+ON\b', up):
                notes.append(("COMMENT", s[:100]))
                continue
            if re.match(r'^ALTER\s+(ROLE|DATABASE|DEFAULT|EXTENSION|SCHEMA|TYPE|SEQUENCE|VIEW|FUNCTION|POLICY|TRIGGER|INDEX|PUBLICATION)\b', up):
                man.append(f"ALTER {s[:100]} — down = reverse alter (manual)")
                continue
            notes.append(("OTHER", s[:100]))
    downs = [st for k in ORDER for st in B[k]]
    return downs, notes, man

# ---------------- main
def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    import datetime
    cutoff = datetime.datetime(2026, 7, 4, tzinfo=datetime.timezone.utc).timestamp()
    files = sorted(f for f in os.listdir(MIG_DIR) if f.endswith('.sql'))
    files = [f for f in files if os.path.getmtime(os.path.join(MIG_DIR, f)) >= cutoff]
    print(f"Active migrations (30d): {len(files)}")

    # cross-ref with DB
    dbm = mcp_call("supabase_db_query", {"sql": "SELECT count(*) AS total FROM supabase_migrations.schema_migrations"})
    m = re.search(r'"total"\s*:\s*"?(\d+)"?', dbm.get("text", ""))
    db_rows = int(m.group(1)) if m else 0
    print(f"DB schema_migrations rows: {db_rows}")

    report = []
    downs_all = []
    results = []
    for fname in files:
        path = os.path.join(MIG_DIR, fname)
        sql = open(path, encoding='utf-8', errors='replace').read()
        stmts = split_statements(sql)
        downs, notes, man = generate_down(fname, stmts)
        results.append((fname, downs, notes, man, stmts))

    # Pass 1: full down in one rolled-back txn
    for idx, (fname, downs, notes, man, stmts) in enumerate(results):
        if not downs:
            verdict = "MANUAL"
            detail = "; ".join(man[:3]) if man else ("; ".join(n[1] for n in notes[:3]) or "no structural DDL")
            report.append((fname, verdict, "no structural DDL — " + detail, "", 0))
            print(f"[{idx+1}/{len(results)}] {fname}: MANUAL")
            continue
        body = "BEGIN;\nSET LOCAL statement_timeout='25s';\nSET LOCAL lock_timeout='10s';\n" + "\n".join(downs) + "\nROLLBACK;"
        t0 = time.time()
        res = mcp_call("supabase_db_query", {"sql": body})
        dt = time.time() - t0
        if not res.get("isError") and "ERROR" not in res.get("text", "").upper() and not res.get("error"):
            report.append((fname, "PASS", "", "", dt))
            print(f"[{idx+1}/{len(results)}] {fname}: PASS ({dt:.1f}s)")
        else:
            err = extract_error(res)
            report.append((fname, "RETRY_CASCADE", err, "", dt))
            print(f"[{idx+1}/{len(results)}] {fname}: FAIL -> {err}")

    # Pass 2: failures -> isolate culprit + retry with CASCADE
    for idx, (fname, downs, notes, man, stmts) in enumerate(results):
        r = report[idx]
        if r[1] != "RETRY_CASCADE":
            continue
        # per-statement isolation
        culprit, culprit_err = None, None
        for d in downs:
            body = f"BEGIN;\nSET LOCAL statement_timeout='25s';\n{d}\nROLLBACK;"
            res = mcp_call("supabase_db_query", {"sql": body})
            if res.get("isError") or "ERROR" in res.get("text", "").upper() or res.get("error"):
                culprit, culprit_err = d, extract_error(res)
                break
        # retry full with CASCADE
        casc = "\n".join(downs)
        casc = re.sub(r'(DROP (?:FUNCTION|PROCEDURE) IF EXISTS [^;]+);', r'\1 CASCADE;', casc)
        casc = re.sub(r'(DROP VIEW IF EXISTS [^;]+);', r'\1 CASCADE;', casc)
        casc = re.sub(r'(DROP MATERIALIZED VIEW IF EXISTS [^;]+);', r'\1 CASCADE;', casc)
        casc = re.sub(r'(ALTER TABLE [^;]+? DROP COLUMN IF EXISTS [A-Za-z_][A-Za-z0-9_$]*);', r'\1 CASCADE;', casc)
        body = "BEGIN;\nSET LOCAL statement_timeout='25s';\nSET LOCAL lock_timeout='10s';\n" + casc + "\nROLLBACK;"
        res = mcp_call("supabase_db_query", {"sql": body})
        if not res.get("isError") and "ERROR" not in res.get("text", "").upper() and not res.get("error"):
            report[idx] = (fname, "PASS_CASCADE", f"culprit w/o CASCADE: {culprit} -> {culprit_err}", "", 0)
            print(f"[retry] {fname}: PASS_CASCADE")
        else:
            report[idx] = (fname, "FAIL", f"culprit: {culprit} -> {culprit_err} | full+CASCADE: {extract_error(res)}", "", 0)
            print(f"[retry] {fname}: FAIL even with CASCADE")

    # summary
    from collections import Counter
    cnt = Counter(r[1] for r in report)
    print("\n=== SUMMARY ===")
    print(json.dumps(cnt, indent=2))

    with open(os.path.join(OUT_DIR, "rollback-test-report.md"), "w", encoding="utf-8") as f:
        f.write("# Rollback Test Report — supabase/migrations (últimos 30 dias)\n\n")
        f.write(f"Data: {time.strftime('%Y-%m-%d %H:%M')} | Migrations testadas: {len(report)} | DB schema_migrations: {db_rows}\n\n")
        f.write("Método: down-script gerado por análise estática do arquivo, executado em transação `BEGIN;...;ROLLBACK;` (nada persiste). PASS = down roda limpo; PASS_CASCADE = requer CASCADE (dependentes existem); FAIL = down falha mesmo com CASCADE; MANUAL = sem DDL estrutural reversível automaticamente (funções REPLACE, data migrations, drops).\n\n")
        f.write("## Resumo\n\n| Verdict | Qtd |\n|---|---|\n")
        for k, v in cnt.most_common():
            f.write(f"| {k} | {v} |\n")
        f.write("\n## Detalhe\n\n| Migration | Verdict | Notas |\n|---|---|---|\n")
        for fname, verdict, detail, _, dt in report:
            notes_txt = []
            for rf in results:
                if rf[0] == fname:
                    for t, d in rf[2][:5]:
                        notes_txt.append(f"{t}: {d}")
                    for d in rf[3][:5]:
                        notes_txt.append(f"MANUAL: {d}")
                    break
            detail_s = detail.replace("|", "\\|")[:220]
            notes_s = "; ".join(notes_txt).replace("|", "\\|")[:300]
            f.write(f"| {fname} | {verdict} | {detail_s} {notes_s} |\n")
    print("Report written to", os.path.join(OUT_DIR, "rollback-test-report.md"))

    with open(os.path.join(OUT_DIR, "down-scripts.sql"), "w", encoding="utf-8") as f:
        for fname, downs, notes, man, stmts in results:
            f.write(f"\n-- ===== {fname} =====\n")
            if downs:
                f.write("\n".join(downs) + "\n")
            if man:
                f.write("-- MANUAL:\n" + "\n".join("--   " + x for x in man) + "\n")
    print("Down scripts written to", os.path.join(OUT_DIR, "down-scripts.sql"))

if __name__ == "__main__":
    main()
