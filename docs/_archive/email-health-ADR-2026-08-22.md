# ADR — email-health: arquivamento executado (2026-08-22)

**Status:** Aceito (executado em 2026-08-22, confirmado pelo responsável via prompt interativo)
**Escopo:** PLANO-100-CONTRATOS-EDGE, Bloco 9, etapa 96 (`ESTADO.md` grupo F)
**Autor:** sessão de continuação do plano de correções/melhorias (2026-08-22)

## Contexto

`ESTADO.md` grupo F ("SEM CHAMADOR identificado — candidatas a arquivar") listava `email-health`
junto com outras 15 funções, com a nota explícita: "Decisao de arquivar e do responsavel — esta
lista e diagnostico, nao sentenca." Diferente das outras 15 (onde a ausência de chamador é só
"não encontrado ainda"), `email-health` tinha evidência POSITIVA de ter sido deliberadamente
contornada — não era apenas "sem chamador", era "chamador removido de propósito".

## Evidência coletada (2026-08-22)

| Fonte | Resultado |
|---|---|
| `supabase/functions/email-health/index.ts` | Existia, deployável, chamava `rpc_get_email_health_summary` + `rpc_email_health_check` (JWT obrigatório via `requireUser`) |
| `src/pages/admin/email/useEmailHealthStatus.ts:56` | Comentário explícito no código: **"A edge `email-health` não existe (404 silencioso). O dado real vem do..."** — o hook já fazia fallback direto pra RPC, contornando a edge de propósito |
| `src/pages/admin/email/useEmailHealthStatus.ts:131` | Segundo comentário: revalidação também era local, "a edge `email-health` não existe" |
| `docs/audit/feature-registry-2026-08-04/FEATURE_REGISTRY.md:152-153` (EMAIL-12/13) | Auditoria anterior já flagrou o mesmo fio quebrado — recomendação registrada era "renomear email-health→gmail-health", mas **`gmail-health` não existe como diretório neste repo** (confirmado via `ls supabase/functions/`) — a função nunca foi de fato renomeada/recriada, só documentada como se devesse ser |
| `ESTADO.md` grupo F (mais recente que o FEATURE_REGISTRY de 08-04) | `email-health` — 0 chamadores em front/edge/cron/N8N, 1 menção em doc |
| Grep repo-wide (`grep -rn "email-health"`) | Nenhum outro caller: nenhuma migration, nenhum outro `index.ts`, nenhum cron job, nenhum workflow CI que invocasse esta função em runtime — só registro de contrato (`CONTRACT_SCHEMAS`/`CONTRACTS`/`edge-contract-schemas.ts`) e os 2 comentários do frontend explicando por que ela era contornada |
| `docs/validacao/V5-edge-functions.md:90` | Confirmava independentemente: "o front já sabe disso" (que a edge não existe/não é usada) |

**Conclusão:** `email-health` estava 100% redundante com o caminho RPC direto que o próprio
frontend já usava e documentava como definitivo. Nenhum sistema (front, outra edge, cron, N8N,
ou fluxo de integração externa) dependia dela.

## Decisão executada

1. Removido `supabase/functions/email-health/` (`index.ts`) do repositório. Este ADR foi movido
   pra cá (`docs/_archive/`) antes da remoção, como registro permanente da decisão.
2. Removida a entrada `"email-health"` de `CONTRACT_SCHEMAS` (`contract-schemas.ts`,
   `EmailHealthV1Schema` incluído) e de `CONTRACTS` (`contract-versions.ts`).
3. Removida a entrada `'email-health'` de `EdgeFunctionContractSchemas`
   (`edge-contract-schemas.ts`).
4. Simplificados os comentários em `useEmailHealthStatus.ts:56` e `:131` — o "fallback" via RPC
   direto passou a ser o caminho único documentado, não mais uma exceção a um caminho primário
   inexistente.
5. Validado: suíte `deno test` completa (invariantes de registro confirmam ausência de
   referência órfã de um lado só) + `bun run typecheck`/vitest do frontend.

## Se precisar reverter

O código da função (`index.ts`, lógica das 2 RPCs) está preservado no histórico do git antes
deste commit — `git log --all --full-history -- supabase/functions/email-health/index.ts`.
Recriar a função e as 3 entradas de registro reverte a decisão sem perda de lógica.
