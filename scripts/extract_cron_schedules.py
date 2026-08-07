#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Extrai triplas (jobname, schedule, command) de cron.schedule(...) das migrations.

Tokeniza SQL respeitando strings '', "", comentarios -- /* */ e dollar-quotes $tag$.
Regra de corpo: `DO $tag$ ... $tag$` (delimitador de bloco PL/pgSQL) e tokenizado
como CODIGO (PERFORM cron.schedule dentro de DO e SQL real); qualquer $tag$ interno
com tag diferente e LITERAL (pulado, ex.: $cmd$ em argumentos de cron.schedule).
Reporta: arquivo, linha, contexto (SELECT/PERFORM), jobname, schedule, command,
e flag de ON CONFLICT invalido dentro do statement.
"""
import re, sys, glob, os, bisect, json

# regexes compilados com .match(sql, pos) — sem slice sql[i:], evita O(n^2)
_PAT_DOLLAR = re.compile(r'\$[A-Za-z_0-9]*\$')
_PAT_IDENT = re.compile(r'[A-Za-z_][A-Za-z_0-9]*')
_PAT_DIGIT = re.compile(r'\d+')
_PAT_WS = re.compile(r'\s+')

def tokenize(sql):
    """Tokens: (kind, text, offset). kind: ident|punct|str|dollar|other.

    DO $tag$ ... $tag$ (bloco PL/pgSQL) e tokenizado como CODIGO — PERFORM
    cron.schedule dentro de DO e SQL real; qualquer $tag$ interno de outra
    tag (ex.: $cmd$ em argumentos) e LITERAL e pulado ate o fechamento.
    """
    toks = []
    i, n = 0, len(sql)
    do_stack = []  # tags de corpo DO abertas (codigo, nao literal)
    while i < n:
        c = sql[i]
        if c == '-' and i+1 < n and sql[i+1] == '-':
            j = sql.find('\n', i); j = n if j == -1 else j
            toks.append(('comment', sql[i:j], i)); i = j; continue
        if c == '/' and i+1 < n and sql[i+1] == '*':
            j = sql.find('*/', i+2); j = (n if j == -1 else j+2)
            toks.append(('comment', sql[i:j], i)); i = j; continue
        if c == "'":
            j = i+1; buf = [c]
            while j < n:
                if sql[j] == "'":
                    if j+1 < n and sql[j+1] == "'": buf.append("''"); j += 2; continue
                    buf.append("'"); j += 1; break
                buf.append(sql[j]); j += 1
            toks.append(('str', ''.join(buf), i)); i = j; continue
        if c == '$':
            m = _PAT_DOLLAR.match(sql, i)
            if m:
                tag = m.group(0)
                # fecha corpo DO (tag igual ao topo da pilha) -> token de fechamento
                if do_stack and tag == do_stack[-1]:
                    do_stack.pop()
                    toks.append(('punct', '$', i)); i += 1; continue
                # tag nova no estado normal: literal -> pula ate o fechamento
                j = sql.find(tag, i+len(tag)); j = (n if j == -1 else j+len(tag))
                toks.append(('dollar', sql[i:j], i)); i = j; continue
        if c.isalpha() or c == '_':
            m = _PAT_IDENT.match(sql, i)
            word = m.group(0)
            toks.append(('ident', word, i)); i += len(word)
            # DO seguido de $tag$ = corpo de codigo (abre pilha)
            if word == 'DO':
                j = i
                while j < n and sql[j] in ' \t\r\n': j += 1
                m2 = _PAT_DOLLAR.match(sql, j)
                if m2 and not (do_stack and m2.group(0) == do_stack[-1]):
                    do_stack.append(m2.group(0))
                    # consome a tag de abertura como token punct
                    i = j + len(m2.group(0))
                    toks.append(('punct', '$', j))
            continue
        if c.isdigit():
            m = _PAT_DIGIT.match(sql, i)
            toks.append(('ident', m.group(0), i)); i += len(m.group(0)); continue
        if c in '(),;.':
            toks.append(('punct', c, i)); i += 1; continue
        m = _PAT_WS.match(sql, i)
        if m: i += len(m.group(0)); continue
        toks.append(('other', c, i)); i += 1
    return toks

def extract_literal(tokens, pos):
    """Literal str/dollar em pos -> (valor, pos_fim); senao (None, pos)."""
    if pos >= len(tokens): return None, pos
    t = tokens[pos]
    if t[0] == 'str':
        return t[1][1:-1].replace("''", "'"), pos+1
    if t[0] == 'dollar':
        m = re.match(r'\$[A-Za-z_0-9]*\$(.*)\$[A-Za-z_0-9]*\$', t[1], re.S)
        return (m.group(1) if m else t[1]), pos+1
    return None, pos

def line_of(lines, offset):
    return bisect.bisect_right(lines, offset)

def extract_file(path):
    with open(path, encoding='utf-8', errors='replace') as f:
        sql = f.read()
    lines = [0]
    for i2, ch in enumerate(sql):
        if ch == '\n': lines.append(i2+1)
    toks = tokenize(sql)
    n = len(toks)
    out = []
    for idx in range(2, n):
        t = toks[idx]
        if t[0] != 'ident' or t[1] not in ('schedule', 'schedule_in_database'): continue
        if toks[idx-1] != ('punct', '.', toks[idx-1][2]): continue
        if toks[idx-2][0] != 'ident' or toks[idx-2][1] != 'cron': continue
        # contexto: keyword antes de 'cron' (SELECT/PERFORM/;)
        ctx = 'SELECT'
        for b in range(idx-3, max(0, idx-8), -1):
            if toks[b][0] == 'ident' and toks[b][1] in ('SELECT', 'PERFORM'):
                ctx = toks[b][1]; break
            if toks[b] == ('punct', ';', toks[b][2]): break
        k = idx+1
        while k < n and toks[k] != ('punct', '(', toks[k][2]): k += 1
        if k >= n: continue
        depth = 0; j = k; args = []; cur = []
        while j < n:
            t2 = toks[j]
            if t2[0] == 'comment': j += 1; continue
            if t2[0] == 'punct' and t2[1] == '(':
                depth += 1
                if depth > 1: cur.append(t2)
                j += 1; continue
            if t2[0] == 'punct' and t2[1] == ')':
                depth -= 1
                if depth == 0:
                    if cur: args.append(cur)
                    break
                cur.append(t2); j += 1; continue
            if t2[0] == 'punct' and t2[1] == ',' and depth == 1:
                args.append(cur); cur = []
                j += 1; continue
            cur.append(t2); j += 1
        if depth != 0: continue
        vals = []
        for a in args:
            p = 0
            while p < len(a) and a[p][0] == 'comment': p += 1
            v, _ = extract_literal(a, p)
            vals.append(v)
        raw = ' '.join(x[1] for arg in args for x in arg)
        out.append({
            'file': os.path.basename(path),
            'line': line_of(lines, toks[idx][2]),
            'ctx': ctx,
            'jobname': vals[0] if len(vals) > 0 else None,
            'schedule': vals[1] if len(vals) > 1 else None,
            'command': vals[2] if len(vals) > 2 else None,
            'database': vals[3] if len(vals) > 3 else None,
            'on_conflict': bool(re.search(r'\bON\s+CONFLICT\b', raw, re.I)),
        })
    for m in re.finditer(r'INSERT\s+INTO\s+cron\.job\b', sql, re.I):
        out.append({'file': os.path.basename(path), 'line': line_of(lines, m.start()),
                    'ctx': 'INSERT', 'jobname': None, 'schedule': None, 'command': None,
                    'database': None, 'on_conflict': False})
    return out

def main():
    migdir = sys.argv[1] if len(sys.argv) > 1 else 'supabase/migrations'
    allr = []
    for path in sorted(glob.glob(os.path.join(migdir, '*.sql'))):
        allr.extend(extract_file(path))
    allr.sort(key=lambda r: (r['file'], r['line']))
    for r in allr:
        cmd = (r['command'] or '')
        cmd_s = cmd[:90].replace('\n', '\\n')
        print(f"{r['file']}:{r['line']} | {r['ctx']} | job={r['jobname']!r} | sched={r['schedule']!r}"
              f" | db={r['database']!r} | oc={'YES' if r['on_conflict'] else 'no'} | cmd={cmd_s}")
    print(f"\nTOTAL: {len(allr)} statements em {len(glob.glob(os.path.join(migdir, '*.sql')))} arquivos")
    if len(sys.argv) > 2 and sys.argv[2] == '--json':
        with open(sys.argv[3], 'w', encoding='utf-8') as f:
            json.dump(allr, f, ensure_ascii=False, indent=1)

if __name__ == '__main__':
    main()
