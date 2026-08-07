#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Varredura exaustiva de regclass forward-reference em supabase/migrations.

Abordagem hibrida:
  - pglast (gramatica real PG) apenas para obter boundaries de statements e
    nomes de criacao (CreateStmt/CreateSeqStmt/ViewStmt/CreateMatViewStmt/
    CreateSchemaStmt) — comentarios e strings nunca viram statements.
  - Referencias (nextval/currval/setval, REFERENCES, ON SEQUENCE, CREATE INDEX ON,
    DML INTO/FROM/UPDATE) extraidas TEXTUALMENTE por segmento de statement —
    confiavel e sem falsos positivos de comentarios/dollar-quotes de funcoes
    (CreateFunctionStmt/CreateTrigStmt/CreatePolicyStmt sao ignorados: lazy).
  - CREATE SEQUENCE dentro de DO $$ (comum na casa) detectado textualmente.
"""
import os, re, sys
from collections import defaultdict

MIG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'supabase', 'migrations')

def ts_of(fname):
    m = re.match(r'^(\d{14})', os.path.basename(fname))
    return m.group(1) if m else '0'

def line_of(text, offset):
    return text.count('\n', 0, offset) + 1

def strip_meta(text):
    return '\n'.join(l for l in text.splitlines() if not l.lstrip().startswith('\\'))

RE_NEXTVAL = re.compile(r"(?:nextval|currval|setval)\(\s*'([^']+)'", re.I)
RE_REFERENCES = re.compile(r"\bREFERENCES\s+([\w.\"]+)", re.I)
RE_ON_SEQUENCE = re.compile(r"\bON\s+SEQUENCE\s+([\w.\"]+)", re.I)
RE_CREATE_SEQ = re.compile(r"\bCREATE\s+SEQUENCE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w.\"]+)", re.I)
RE_CREATE_INDEX_ON = re.compile(r"\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:\w+\s+)?ON\s+(?:ONLY\s+)?([\w.\"]+)", re.I)
RE_DML_INTO = re.compile(r"\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+([\w.\"]+)", re.I)
RE_GRANT_ON_TABLE = re.compile(r"\bGRANT\s+[^;]*?\bON\s+TABLE\s+([\w.\"]+)", re.I)
RE_SELECT_FROM = re.compile(r"\bSELECT\b[^;]*?\bFROM\s+([\w.\"]+)", re.I)
RE_ALTER_SEQ = re.compile(r"\bALTER\s+SEQUENCE\s+([\w.\"]+)", re.I)
RE_OWNED_BY = re.compile(r"\bOWNED\s+BY\s+([\w.\"]+)", re.I)

def clean(name):
    return name.replace('"', '')

def scan_segment(seg, ln, refs, ctx_label, want_select=False):
    for m in RE_NEXTVAL.finditer(seg):
        refs.append((ln, 'SEQ', clean(m.group(1).split('::')[0]), ctx_label + ' nextval'))
    for m in RE_REFERENCES.finditer(seg):
        refs.append((ln, 'FK', clean(m.group(1)), ctx_label + ' REFERENCES'))
    for m in RE_ON_SEQUENCE.finditer(seg):
        refs.append((ln, 'SEQ', clean(m.group(1)), ctx_label + ' ON SEQUENCE'))
    for m in RE_ALTER_SEQ.finditer(seg):
        refs.append((ln, 'SEQ', clean(m.group(1)), ctx_label + ' ALTER SEQUENCE'))
    if want_select:
        for m in RE_SELECT_FROM.finditer(seg):
            refs.append((ln, 'TBL', clean(m.group(1)), ctx_label + ' SELECT FROM'))

def pglast_scan(path, text):
    from pglast import parse_sql
    creates, refs = [], []
    stmts = parse_sql(text)
    for raw in stmts:
        stmt = raw.stmt
        loc = raw.stmt_location
        ln = line_of(text, loc)
        seg = text[loc:loc + (raw.stmt_len or 0)]
        cls = type(stmt).__name__
        if cls == 'CreateStmt':
            rel = stmt.relation
            name = (rel.schemaname + '.' if rel.schemaname else '') + rel.relname
            creates.append((ln, 'TABLE', name))
            scan_segment(seg, ln, refs, f'CREATE TABLE {name}')
        elif cls == 'CreateSeqStmt':
            sq = stmt.sequence
            name = (sq.schemaname + '.' if sq.schemaname else '') + sq.relname
            creates.append((ln, 'SEQUENCE', name))
        elif cls == 'ViewStmt':
            v = stmt.view
            name = (v.schemaname + '.' if v.schemaname else '') + v.relname
            creates.append((ln, 'VIEW', name))
        elif cls == 'CreateMatViewStmt':
            v = stmt.mview
            name = (v.schemaname + '.' if v.schemaname else '') + v.relname
            creates.append((ln, 'MATVIEW', name))
            scan_segment(seg, ln, refs, f'MATVIEW {name}', want_select=True)
        elif cls == 'CreateSchemaStmt':
            creates.append((ln, 'SCHEMA', stmt.schemaname))
        elif cls == 'AlterTableStmt':
            rel = stmt.relation
            tname = (rel.schemaname + '.' if rel.schemaname else '') + rel.relname
            scan_segment(seg, ln, refs, f'ALTER TABLE {tname}')
        elif cls == 'DoStmt':
            scan_segment(seg, ln, refs, 'DO')
            for m in RE_CREATE_SEQ.finditer(seg):
                creates.append((ln, 'SEQUENCE', clean(m.group(1))))
        elif cls == 'GrantStmt':
            if str(getattr(stmt, 'objtype', '')).find('SEQUENCE') >= 0:
                scan_segment(seg, ln, refs, 'GRANT')
        elif cls in ('IndexStmt',):
            scan_segment(seg, ln, refs, 'INDEX')
        elif cls in ('InsertStmt', 'UpdateStmt', 'DeleteStmt', 'TruncateStmt'):
            for m in RE_DML_INTO.finditer(seg):
                refs.append((ln, 'TBL', clean(m.group(1)), cls))
        elif cls == 'SelectStmt':
            scan_segment(seg, ln, refs, 'SELECT', want_select=True)
        elif cls in ('CreateFunctionStmt', 'CreateTrigStmt', 'CreatePolicyStmt',
                     'CreateExtensionStmt', 'CreateEnumStmt', 'CreateDomainStmt',
                     'CreatePublicationStmt', 'CreateRoleStmt', 'CommentStmt',
                     'DropStmt', 'DropOwnedStmt', 'RenameStmt', 'AlterFunctionStmt',
                     'AlterRoleStmt', 'AlterOwnerStmt', 'AlterDefaultPrivilegesStmt',
                     'AlterPolicyStmt', 'AlterExtensionStmt', 'AlterPublicationStmt',
                     'AlterDatabaseStmt', 'AlterSeqStmt', 'SetStmt', 'VacuumStmt',
                     'ReindexStmt', 'ClusterStmt', 'CopyStmt', 'CreateCastStmt',
                     'CreateStatsStmt', 'CreateTableAsStmt', 'RefreshMatViewStmt',
                     'CreateForeignTableStmt', 'DefineStmt', 'CreateAmStmt',
                     'CreateConversionStmt', 'CreateEventTrigStmt', 'CreateGroupStmt',
                     'CreateOpClassStmt', 'CreateOpFamilyStmt', 'CreateTableSpaceStmt',
                     'CreateTransformStmt', 'CreateUserStmt', 'CreateUserMappingStmt',
                     'CreatedbStmt', 'ExplainStmt', 'FetchStmt', 'GrantRoleStmt',
                     'ImportForeignSchemaStmt', 'ListenStmt', 'LoadStmt', 'LockStmt',
                     'NotifyStmt', 'PrepareStmt', 'ReassignOwnedStmt', 'ReleaseStmt',
                     'ResetStmt', 'RevokeStmt', 'RevokeRoleStmt', 'RuleStmt',
                     'SecLabelStmt', 'TransactionStmt', 'UnlistenStmt', 'VariableSetStmt'):
            pass
        else:
            # desconhecido: cobre CREATE RULE etc.
            scan_segment(seg, ln, refs, cls)
    return creates, refs

def main():
    files = sorted(f for f in os.listdir(MIG_DIR) if f.endswith('.sql'))
    all_creates = defaultdict(list)
    results = []
    parse_fail = []
    for fn in files:
        path = os.path.join(MIG_DIR, fn)
        with open(path, 'r', encoding='utf-8', errors='replace') as fh:
            text = fh.read()
        stripped = strip_meta(text)
        try:
            creates, refs = pglast_scan(path, stripped)
        except Exception as e:
            parse_fail.append((fn, str(e)[:200]))
            continue
        for ln, kind, name in creates:
            all_creates[name].append((fn, ln))
        results.append((fn, creates, refs))

    first_create = {}
    for name, lst in all_creates.items():
        lst_sorted = sorted(lst, key=lambda x: (ts_of(x[0]), x[1]))
        first_create[name] = lst_sorted[0]

    print(f'{"ARQUIVO":<58} {"LN":<5} {"TIPO":<4} {"OBJETO":<60} {"STATUS":<58} CONTEXTO')
    print('-' * 190)
    problems = []
    for fn, creates, refs in results:
        create_map = {}
        for ln, kind, name in creates:
            if name not in create_map or ln < create_map[name]:
                create_map[name] = ln
        for ln, rtype, name, ctx in refs:
            # ignora refs a tipos primitivos que o regex pega (ex: REFERENCES em enum?)
            if rtype == 'FK' and not re.search(r'[._]', name) and len(name) < 60:
                pass
            if name in create_map:
                if ln > create_map[name]:
                    status = 'ok (pos-criacao)'
                else:
                    status = 'FWDREF MESMO ARQUIVO'
                    problems.append((fn, ln, rtype, name, ctx))
            else:
                fc = first_create.get(name)
                if fc is None:
                    status = 'nao-criado-no-repo'
                else:
                    fcfn, fcln = fc
                    if ts_of(fcfn) > ts_of(fn):
                        status = f'FWDREF OUTRO ARQ (criado {fcfn}:{fcln} DEPOIS)'
                        problems.append((fn, ln, rtype, name, ctx))
                    else:
                        status = f'ok (criado {fcfn}:{fcln})'
            print(f'{fn:<58} {ln:<5} {rtype:<4} {name:<60} {status:<58} {ctx}')
    print()
    print(f'== PARSE FAILS ({len(parse_fail)}) ==')
    for fn, err in parse_fail:
        print(f'  {fn}: {err}')
    print()
    print(f'== PROBLEMAS ({len(problems)}) ==')
    for p in problems:
        print('  ', p)

if __name__ == '__main__':
    main()
