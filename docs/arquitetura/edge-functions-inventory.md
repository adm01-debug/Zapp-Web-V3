# Inventário de Edge Functions — Repo vs Volume Deployado

- **Data da auditoria:** 2026-08-01
- **Ambiente:** Supabase self-hosted — supabase.atomicabr.com.br
- **Volume deployado:** `/home/deno/functions` (edge-runtime self-hosted)
- **Repositório:** adm01-debug/zapp-web-v3 (worktree `C:/c/tmp/wt-audit`)

---

## 1. Números da auditoria (2026-08-01)

| Métrica | Valor |
|---|---|
| Diretórios de functions no repo (`supabase/functions/`) | **121** |
| Funções deployadas no volume `/home/deno/functions` | **120** |
| Funções no repo **sem deploy** | **9** |

---

## 2. Recontagem direta no worktree (mesma data)

- `ls -d supabase/functions/*/` no worktree retornou **131 diretórios** (+10 vs os 121 da auditoria).
- **Discrepância a conciliar** — causas possíveis (não medidas): diretórios criados/removidos após a auditoria, ou critério de contagem diferente (ex.: exclusão de `main/`, `_shared/`, `_test/`, `tests/`).
- As **8 funções citadas** como sem deploy foram **confirmadas presentes** no worktree (tabela abaixo). A **9ª função** sem deploy não foi especificada no contexto da auditoria — **não medido**.

---

## 3. Funções no repo SEM deploy (por prioridade)

| Função | Prioridade | Status |
|---|---|---|
| `sicoob-outbox-consumer` | **P0** | sem deploy |
| `nps-scheduler` | P1 | sem deploy |
| `talkx-control` | P1 | sem deploy |
| `talkx-add-recipients` | P1 | sem deploy |
| `metrics` | P2 | sem deploy |
| `mcp` | P2 | sem deploy |
| `health` | P2 | sem deploy |
| `migrate-helper` | P3 | sem deploy |
| (9ª função) | — | não especificada na auditoria (não medido) |

Prioridades: **P0** = impacto direto em fluxo de negócio (outbox do sicoob); **P1** = fluxos de negócio (NPS, talkx); **P2** = observabilidade/ferramentas; **P3** = utilitário de migração (uso pontual).

**Dedução aritmética:** com os números da auditoria (121 no repo − 9 sem deploy = 112 originadas do repo) e 120 no volume, restam ~8 funções no volume **sem correspondência no repo** (legadas/removidas do repo) — reconciliação nominal: **não medida**.

---

## 4. Regras de deploy

- Diretórios **`_test`** e **`tests`** **NUNCA devem ser deployados** (ambos existem no worktree; são fixtures/auxiliares de teste).
- `_shared` é código compartilhado (importado pelas functions), não uma função standalone.
- Ao deployar, copiar o diretório da função para `/home/deno/functions/<nome>` no volume e **reiniciar o worker** (o runtime carrega pelo path).

---

## 5. Alerta: `main/index.ts` do volume DESATUALIZADO

- O volume roda `main/index.ts` **desatualizado**: versão antiga de **~90 linhas** vs versão do repo **melhorada (165 linhas)**.
- O que a versão do repo adiciona: allowlist **`PUBLIC_FNS`** com as 23 funções públicas, suporte a **`JWT_SECRET_FILE`** (segredo montado, ex.: `/run/secrets/jwt_secret`), guards de env não resolvida (**`MISSING__`**) e fail-fast de `JWT_SECRET`.
- **Impacto:** auth e roteamento do runtime divergem do repo — o comportamento documentado em `edge-auth.md` só vale de fato após o redeploy do `main`.
- **Ação pendente:** redeploy do `main` a partir do repo.

---

## 6. Referências

- `edge-auth.md` (auth do runtime e allowlist `PUBLIC_FNS`)
- `supabase/functions/main/index.ts` (repo, 165 linhas)
