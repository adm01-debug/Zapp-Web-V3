import pglast
import re

path = r'C:\zapp-web-v3\scripts\sql\media-bucket-verification.sql'
s = open(path, encoding='utf-8').read()

# Meta-comandos psql (linhas iniciadas com \) nao sao SQL — psql -f entende, pglast nao.
meta = [l for l in s.splitlines() if l.lstrip().startswith('\\')]
print('meta-comandos psql:', meta or 'nenhum')

sql_only = '\n'.join(l for l in s.splitlines() if not l.lstrip().startswith('\\'))
stmts = pglast.parse_sql(sql_only)
print(f'PARSE OK: {len(stmts)} statements SQL')

bad = sorted(set(re.findall(r'[^\x00-\x7F]', s)))
print('nao-ASCII:', bad if bad else 'nenhum')

# Gate G inclui audio-memes? (blindagem contra regressao)
if 'audio-memes' in sql_only and 'MEDIA_BUCKET_REGRESSION' in sql_only:
    print('GATE G: audio-memes coberto (fail-closed OK)')
else:
    print('GATE G: FALHA - audio-memes nao coberto')
