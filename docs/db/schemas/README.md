# Schema Documentation

Catálogo de documentação por schema.

| Schema | Doc | Tables | Views | Matviews | Functions |
|--------|-----|--------|-------|----------|-----------|
| [zapp](zapp.md) | zapp.md | 320 | 406 | 6 | 1052 |
| [evo](evo.md) | evo.md | 193 | 16 | 4 | 69 |
| [public](public.md) | public.md | 1 | 539 | 0 | 145 |
| [ops](ops.md) | ops.md | 20 | 4 | 0 | 47 |
| [bpm](bpm.md) | bpm.md | ~30 | ~15 | 0 | ~40 |
| [ai](ai.md) | ai.md | ~10 | ~2 | 0 | ~15 |
| [financeiro](financeiro.md) | financeiro.md | ~25 | ~5 | 0 | ~20 |
| [email_app](email_app.md) | email_app.md | ~10 | 1 | 0 | ~10 |
| [vendas](vendas.md) | vendas.md | ~20 | ~5 | 0 | ~15 |
| [logistica](logistica.md) | logistica.md | ~15 | ~3 | 0 | ~10 |
| [artes](artes.md) | artes.md | ~5 | 1 | 0 | ~5 |
| [archive](archive.md) | archive.md | ~5 | 1 | 0 | 5 |
| [orphans](orphans.md) | orphans.md | — | — | — | — |

## Gerando documentação

```bash
# Gerar schema docs automaticamente
psql -h localhost -U postgres -d postgres -f scripts/generate_schema_docs.sql
```
