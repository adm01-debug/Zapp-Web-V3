# gen-types-zapp — Regeneração de types do Supabase self-hosted (schemas `zapp` + `evo`)

`scripts/gen-types-zapp.mjs` consulta o `postgres-meta` da VPS AtomicaBR e
regrava `src/integrations/supabase/types.ts` incluindo os schemas `public`,
`zapp` e `evo`. Ele preserva a **cauda Lovable**
(`DatabaseWithoutInternals` + helpers) — só o corpo do `Database` é
substituído.

## Quando rodar

- Após qualquer migração aplicada na VPS que crie/altere tabelas em `zapp`
  ou `evo` (e as bridges em `zapp`).
- Antes de remover mais `@ts-nocheck` ou destravar novos hooks tipados.
- Como parte do checklist pré-release, para garantir que `types.ts` reflete
  o estado exato do banco de produção.

## Pré-requisitos

| Variável | Valor esperado |
|----------|----------------|
| `META_URL` | URL do `postgres-meta` da VPS (ex.: `https://supabase-meta.atomicabr.com.br` — não a URL pública do Supabase). |
| `META_TOKEN` | Bearer token do `postgres-meta` (ou service role JWT com acesso ao endpoint `/generators/typescript`). |
| `SCHEMAS` | Opcional. Padrão `public,zapp,evo`. |
| `OUT_FILE` | Opcional. Padrão `src/integrations/supabase/types.ts`. |

O `META_TOKEN` **nunca** deve ir para o repositório. Guarde em cofre de
secrets pessoal ou nos GitHub Secrets do workflow (ver abaixo).

## Uso local

```bash
export META_URL="https://supabase-meta.atomicabr.com.br"
export META_TOKEN="<token>"

bun run gen:types:zapp
# ou: node scripts/gen-types-zapp.mjs
```

Verificação após rodar:

```bash
# 1. Diff deve tocar SÓ o corpo de `Database` (não a cauda Lovable).
git diff --stat src/integrations/supabase/types.ts

# 2. Ratchet TS precisa continuar verde.
node scripts/check-tsc-ratchet.mjs

# 3. Guardrails de schema precisam continuar verdes.
node scripts/check-schema-usage.mjs
node scripts/simulate-schema-access.mjs

# 4. Invalidar cache do Vite (o types.ts é pesado — força re-parse).
rm -rf node_modules/.vite
```

Se algum guardrail passar a falhar, **não commitar** o diff — investigue
antes (provavelmente uma tabela sumiu ou mudou coluna crítica).

## Execução via GitHub Actions

O workflow manual `.github/workflows/gen-types-zapp.yml`
(`workflow_dispatch`) executa o script no runner com acesso aos secrets
`META_URL` e `META_TOKEN`, abre um PR automático com o diff e roda o
ratchet TS antes de marcar como pronto para revisão.

Como disparar:

1. GitHub → **Actions** → **Regenerate Supabase types (zapp + evo)** →
   **Run workflow**.
2. Selecionar a branch alvo (geralmente `main`) e confirmar.
3. Aguardar o PR aparecer com título `chore(types): regenerate zapp/evo`.
4. Revisar o diff — se tocar cauda Lovable, **rejeitar** e investigar.

## Anti-patterns

| Erro | Correção |
|------|----------|
| `SCHEMAS=public` (sem `zapp,evo`) | Restaure `public,zapp,evo`; sem `zapp` o app inteiro perde tipos. |
| Sobrescrever `types.ts` manualmente | Sempre rode este script — ele preserva a cauda Lovable automaticamente. |
| Committar `META_TOKEN` no repositório | Rotacione o token na VPS imediatamente e purgue do histórico. |
| Ignorar aviso do ratchet após regenerar | Regenerar tipos pode expor erros latentes. Corrija ou registre o novo baseline via `--update` com justificativa em PR. |
