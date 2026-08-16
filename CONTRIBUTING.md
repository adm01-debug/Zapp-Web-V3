# Guia de Contribuição — zapp-web-v3

## Conventional Commits

Todos os commits DEVEM seguir o formato:

```
type(scope): descrição curta em minúsculas

Corpo opcional (max 120 chars/linha)
```

### Tipos permitidos

| Tipo | Uso |
|------|-----|
| `feat` | Nova funcionalidade |
| `fix` | Correção de bug |
| `docs` | Documentação |
| `style` | Formatação, sem alteração lógica |
| `refactor` | Refatoração sem mudar comportamento |
| `perf` | Melhoria de performance |
| `test` | Testes |
| `build` | Build / deps |
| `ci` | CI/CD |
| `chore` | Maint / configs |
| `security` | Segurança |
| `revert` | Revert |

### Regras

- `type-case`: `lower-case` obrigatório
- `subject-case`: `lower-case` obrigatório
- `subject-min-length`: mínimo 10 chars
- `subject-max-length`: máximo 100 chars
- `header-max-length`: máximo 100 chars
- `body-max-line-length`: máximo 120 chars
- Não terminar com `.`

### Exemplos

```bash
# Correto
git commit -m "feat(contacts): adiciona filtro por tag na busca"
git commit -m "fix(realtime): corrige schema zapp nas subscriptions"
git commit -m "security(db): revoga execute anon em fn_rate_limit_check"

# Errado
git commit -m "Fixed bug"              # sem tipo
git commit -m "feat: Fix Bug"          # case errado
git commit -m "feat: x"               # muito curto
```

## Branch Strategy

- `main` — produção (protegida)
- Feature branches: `feat/nome-da-feature`
- Fix branches: `fix/nome-do-bug`

## Pull Requests

1. Fork ou branch a partir de `main`
2. Commits seguindo Conventional Commits
3. PR contra `main`
4. CI deve passar (TypeScript, ESLint, build, security)

## Code Style

- TypeScript strict mode
- ESLint + Prettier
- Sem `// @ts-nocheck` em arquivos novos
- `.single()` → `.maybeSingle()` para queries que podem retornar 0 linhas
- Realtime subscriptions: `schema: 'public'` (mesmo apontando para zapp)

## Database

- Toda nova tabela DEVE ter RLS habilitado
- Views no schema `public` DEVEM ter `security_invoker = true`
- Funções SECURITY DEFINER DEVEM ter `SET search_path`
- NUNCA fazer `GRANT EXECUTE ON FUNCTION ... TO anon`
- Backup convention: `_backup_*_yyyymmdd`
- `pg_cron` VACUUM como single statement

## Mudanças coordenadas entre repos (expand/contract) — E44

O schema `evo` tem dono único: **evolution-stack** (ADR-015). Mudanças que tocam a fronteira ZAPP×EVOLUTION seguem este protocolo:

1. **Quem é o dono:** DDL em `evo.*` → PR no `evolution-stack`. DDL em `zapp.*`/views de contrato → PR no `zapp-web-v3`.
2. **Expand primeiro:** se o ZAPP precisa ler um objeto novo do `evo`, crie a view de contrato em `public.*` (ou bridge em `zapp.*`) **antes** de o evolution-stack criar o objeto — nunca dependa de objeto `evo` que ainda não existe.
3. **Contract depois:** para remover/depreciar, elimine os consumidores (views, funções, crons) **antes** de dropar o objeto; janela mínima de **7 dias** entre remover o último consumidor e o DROP.
4. **PRs cross-repo:** todo PR que toca a fronteira cita o issue-link e menciona o ADR-015 na descrição; merge na ordem expand→contract.
5. **Gates:** migrations novas com `evo.*` no zapp-web-v3 falham o CI (E42); DDL `zapp.*` no evolution-stack falha (E43). Exceções só via allowlist com justificativa.
6. **Teste:** mudança de contrato exige teste que falhe sem a mudança (RED→GREEN).
