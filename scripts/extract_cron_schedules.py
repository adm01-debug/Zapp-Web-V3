#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Extrai triplas (jobname, schedule, command) de SELECT cron.schedule(...) das migrations.

Tokeniza SQL respeitando strings '', "", dollar-quotes $tag$...$tag$, comentarios -- e /* */.
Reporta: arquivo, linha da abertura, jobname, schedule, command (truncado p/ leitura).
Tambem detecta residuos 'ON CONFLICT' dentro de statements cron.schedule e
INSERT INTO cron.job diretos (criacao sem cron.schedule).
"""
import re, sys, glob, os

def tokenize(sql):
    """Retorna lista de tokens: ('str', texto) | ('dollar', texto) | ('ident', texto) | ('punct', char) | ('other', texto)"""
    tokens = []
    i, n = 0, len(sql)
    while i < n:
        c = sql[i]
        # comentario --
        if c == '-' and i+1 < n and sql[i+1] == '-':
            j = sql.find('\n', i)
            if j == -1: j = n
            tokens.append(('comment', sql[i:j]))
            i = j
            continue
        # comentario /* */
        if c == '/' and i+1 < n and sql[i+1] == '*':
            j = sql.find('*/', i+2)
            if j == -1: j = n
            else: j += 2
            tokens.append(('comment', sql[i:j]))
            i = j
            continue
        # string single-quote
        if c == "'":
            j = i+1
            buf = [c]
            while j < n:
                if sql[j] == "'":
                    if j+1 < n and sql[j+1] == "'":
                        buf.append("''"); j += 2; continue
                    buf.append("'"); j += 1; break
                buf.append(sql[j]); j += 1
            tokens.append(('str', ''.join(buf)))
            i = j
            continue
        # dollar quote
        if c == '$':
            m = re.match(r'\$[A-Za-z_0-9]*\$', sql[i:])
            if m:
                tag = m.group(0)
                j = sql.find(tag, i+len(tag))
                if j == -1: j = n
                else: j += len(tag)
                tokens.append(('dollar', sql[i:j]))
                i = j
                continue
        # identificador / palavra
        if c.isalpha() or c == '_':
            m = re.match(r'[A-Za-z_][A-Za-z_0-9]*', sql[i:])
            tokens.append(('ident', m.group(0)))
            i += len(m.group(0))
            continue
        # numero
        if c.isdigit():
            m = re.match(r'\d+', sql[i:])
            tokens.append(('ident', m.group(0)))
            i += len(m.group(0))
            continue
        if c in '(),;.':
            tokens.append(('punct', c))
            i += 1
            continue
        # espaco/outro
        m = re.match(r'\s+', sql[i:])
        if m:
            i += len(m.group(0))
            continue
        tokens.append(('other', c))
        i += 1
    return tokens

def extract_literal(tokens, pos):
    """Se o token em pos e um literal (str/dollar), retorna (valor, pos_fim). Senao (None, pos)."""
    if pos >= len(tokens): return None, pos
    t = tokens[pos]
    if t[0] == 'str':
        v = t[1][1:-1].replace("''", "'")
        return v, pos+1
    if t[0] == 'dollar':
        v = t[1]
        # remove a tag externa
        m = re.match(r'\$[A-Za-z_0-9]*\$(.*)\$[A-Za-z_0-9]*\$', v, re.S)
        return (m.group(1) if m else v), pos+1
    return None, pos

def find_cron_schedules(sql, path):
    """Localiza statements cron.schedule(...) e cron.schedule_in_database(...)."""
    tokens = tokenize(sql)
    out = []
    n = len(tokens)
    for idx in range(n-2):
        if tokens[idx][0] != 'ident': continue
        name = tokens[idx][1]
        if name not in ('schedule', 'schedule_in_database'): continue
        # nome qualificado? token anterior '.'
        if idx >= 1 and tokens[idx-1] == ('punct', '.'):
            prev = tokens[idx-2] if idx >= 2 else None
            if prev and prev[0] == 'ident' and prev[1] == 'cron':
                # acha '('
                k = idx+1
                while k < n and tokens[k] != ('punct', '('):
                    if tokens[k][0] in ('comment',): k += 1; continue
                    break
                if k < n and tokens[k] == ('punct', '('):
                    # balanceia
                    depth = 0
                    j = k
                    args = []
                    cur = []
                    while j < n:
                        t = tokens[j]
                        if t[0] == 'comment':
                            j += 1; continue
                        if t == ('punct', '('):
                            depth += 1
                            if depth > 1: cur.append(t)
                            j += 1; continue
                        if t == ('punct', ')'):
                            depth -= 1
                            if depth == 0:
                                if cur: args.append(cur)
                                break
                            cur.append(t); j += 1; continue
                        if t == ('punct', ',') and depth == 1:
                            args.append(cur); cur = []
                            j += 1; continue
                        cur.append(t); j += 1
                    if depth == 0:
                        # linha do cron.schedule
                        line = sql[:tokens[idx][0] if False else 0]
                        # computar linha: contar \n antes do token idx
                        # tokens nao guardam offset; recomputar pelo texto acumulado
                        out.append((name, args, idx))
    return out

def token_line(sql, tokens, idx):
    """Linha (1-based) onde o token idx comeca."""
    # reconstruir offsets: guardar offset por token seria ideal; aproximar contando
    # texto antes. Simples: caminhar o sql da posicao do token.
    # Para robustez, computamos offsets na tokenizacao: refazer com offsets.
    return None

def compute_lines(sql):
    """Retorna lista de (offset_inicio, linha) por posicao crescente."""
    lines = [0]
    for i, c in enumerate(sql):
        if c == '\n': lines.append(i+1)
    return lines

def line_of(lines, offset):
    import bisect
    return bisect.bisect_right(lines, offset)  # 1-based linha

def main():
    migdir = sys.argv[1] if len(sys.argv) > 1 else 'supabase/migrations'
    files = sorted(glob.glob(os.path.join(migdir, '*.sql')))
    results = []
    for path in files:
        with open(path, encoding='utf-8', errors='replace') as f:
            sql = f.read()
        lines = compute_lines(sql)
        # buscar cron.schedule com offsets (tokenizacao com offsets)
        toks = []
        i, n = 0, len(sql)
        # re-tokenizar com offset
        def tok_with_offsets():
            out = []
            i, n = 0, len(sql)
            while i < n:
                c = sql[i]
                if c == '-' and i+1 < n and sql[i+1] == '-':
                    j = sql.find('\n', i); j = n if j == -1 else j
                    out.append(('comment', sql[i:j], i)); i = j; continue
                if c == '/' and i+1 < n and sql[i+1] == '*':
                    j = sql.find('*/', i+2); j = (n if j == -1 else j+2)
                    out.append(('comment', sql[i:j], i)); i = j; continue
                if c == "'":
                    j = i+1; buf = [c]
                    while j < n:
                        if sql[j] == "'":
                            if j+1 < n and sql[j+1] == "'": buf.append("''"); j += 2; continue
                            buf.append("'"); j += 1; break
                        buf.append(sql[j]); j += 1
                    out.append(('str', ''.join(buf), i)); i = j; continue
                if c == '$':
                    m = re.match(r'\$[A-Za-z_0-9]*\$', sql[i:])
                    if m:
                        tag = m.group(0)
                        j = sql.find(tag, i+len(tag)); j = (n if j == -1 else j+len(tag))
                        out.append(('dollar', sql[i:j], i)); i = j; continue
                if c.isalpha() or c == '_':
                    m = re.match(r'[A-Za-z_][A-Za-z_0-9]*', sql[i:])
                    out.append(('ident', m.group(0), i)); i += len(m.group(0)); continue
                if c.isdigit():
                    m = re.match(r'\d+', sql[i:])
                    out.append(('ident', m.group(0), i)); i += len(m.group(0)); continue
                if c in '(),;.':
                    out.append(('punct', c, i)); i += 1; continue
                m = re.match(r'\s+', sql[i:])
                if m: i += len(m.group(0)); continue
                out.append(('other', c, i)); i += 1
            return out
        toks = tok_with_offsets()
        n = len(toks)
        for idx in range(n-2):
            if toks[idx][0] != 'ident': continue
            name = toks[idx][1]
            if name not in ('schedule', 'schedule_in_database'): continue
            if idx >= 2 and toks[idx-1] == ('punct', '.', toks[idx-1][2]) and toks[idx-2][0] == 'ident' and toks[idx-2][1] == 'cron':
                k = idx+1
                while k < n and toks[k] != ('punct', '(', toks[k][2]):
                    k += 1
                if k >= n: continue
                depth = 0; j = k; args = []; cur = []
                while j < n:
                    t = toks[j]
                    if t[0] == 'comment': j += 1; continue
                    if t[1] == '(' and t[0] == 'punct':
                        depth += 1
                        if depth > 1: cur.append(t)
                        j += 1; continue
                    if t[1] == ')' and t[0] == 'punct':
                        depth -= 1
                        if depth == 0:
                            if cur: args.append(cur)
                            break
                        cur.append(t); j += 1; continue
                    if t[1] == ',' and t[0] == 'punct' and depth == 1:
                        args.append(cur); cur = []
                        j += 1; continue
                    cur.append(t); j += 1
                if depth != 0: continue
                line = line_of(lines, toks[idx][2])
                # extrair literais dos argumentos
                vals = []
                for a in args:
                    # ignora comentarios no inicio
                    p = 0
                    while p < len(a) and a[p][0] == 'comment': p += 1
                    v, _ = extract_literal(a, p)
                    vals.append(v)
                # detecta ON CONFLICT dentro dos args
                raw_args = ' '.join(t[1] for t in [x for arg in args for x in arg])
                on_conflict = bool(re.search(r'\bON\s+CONFLICT\b', raw_args, re.I))
                results.append({
                    'file': os.path.basename(path),
                    'line': line,
                    'fn': name,
                    'jobname': vals[0] if len(vals) > 0 else None,
                    'schedule': vals[1] if len(vals) > 1 else None,
                    'command': vals[2] if len(vals) > 2 else None,
                    'database': vals[3] if len(vals) > 3 else None,
                    'on_conflict': on_conflict,
                    'argc': len(vals),
                })
        # INSERT INTO cron.job direto?
        for m in re.finditer(r'INSERT\s+INTO\s+cron\.job\b', sql, re.I):
            results.append({
                'file': os.path.basename(path),
                'line': line_of(lines, m.start()),
                'fn': 'INSERT INTO cron.job',
                'jobname': None, 'schedule': None, 'command': None,
                'database': None, 'on_conflict': False, 'argc': 0,
            })
    for r in results:
        cmd = (r['command'] or '')
        cmd_short = cmd[:90].replace('\n', '\\n')
        print(f"{r['file']}:{r['line']} | {r['fn']} | job={r['jobname']!r} | sched={r['schedule']!r} | db={r['database']!r} | oc={'YES' if r['on_conflict'] else 'no'} | cmd={cmd_short}")
    print(f"\nTOTAL: {len(results)} statements em {len(files)} arquivos")

if __name__ == '__main__':
    main()
