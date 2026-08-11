# Simulação de Cenários — Onda de Melhorias do Login (2026-08-10)

> Fase 0 obrigatória antes do despacho: matriz "o que quebra se eu mudar X?" com evidência.

## Matriz de risco

| # | Melhoria | Cenário de falha previsto | Impacto | Mitigação aplicada | Veredito |
|---|---|---|---|---|---|
| M1 | Env do Vercel (anon key) | Trocar env errado → app continua 401; redeploy sem env → quebra recorrente | **Alto** | Doc exato com valor (anon key do keyring); verificação pós-deploy decodificando o payload do bundle (role=anon) | SEGURO com verificação |
| M2 | Remover botão Google | Testes/specs referenciando Google; imports órfãos do wrapper lovable | Baixo | `grep` de callers (0 órfãos); spec e2e vira teste de regressão (`toHaveCount(0)`); gates 27/27 | SEGURO |
| M3 | Fix `getClientIP` (XFF) | **Spoofing**: cliente forja XFF → bypass de rate-limit | **Médio** | Hops confiáveis a partir do FIM (os 2 últimos = Traefik+Kong, append garantido); cliente só forja na FRENTE → entry correto é o 3º a partir do fim; teste unitário cobre IPv6/vazio/multihop | SEGURO |
| M4 | auth `start-first` | Duas réplicas temporárias do GoTrue (idempotente, DB compartilhado) | Baixo | `FailureAction: rollback` do Swarm; health check pós-update | SEGURO |
| M5 | Kong (validação/backup) | **Mudar chaves** → 401 geral (repetir incidente) | **Alto** | NÃO alterar chaves; apenas validar consistência + backup; procedimento de rotação documentado | SEGURO com backup |
| M6 | Grants `passkey_credentials` | Grant amplo demais (segurança) | Médio | Policy mínima (padrão do repo); migration versionada | SEGURO |
| M7 | Limpeza de sessões | Deletar sessão ATIVA do adm01 (a de 19:56) | **Médio** | Filtro `created_at < 2026-08-10T19:00Z` + `user_id`; só 15 deletadas, 9 preservadas (todas de 10/08) | SEGURO com filtro |
| M8 | `GOTRUE_MAILER_EXTERNAL_HOSTS` | Nenhum (só silencia warning) | Baixo | Aplicado junto com M4 (1 update do serviço) | SEGURO |
| M9 | Testes de login | E2E dependente de backend real → flaky | Baixo | User de teste dedicado; unit tests sem rede | SEGURO |
| M10 | Docs/skills | — | — | — | SEGURO |

## Gaps identificados na simulação

1. **GAP-1 (P1):** o bundle do Vercel expõe a **service_role key** (payload público). Qualquer pessoa com o bundle tem acesso **admin ao PostgREST** (ACL `admin`) até 2029. → Fix: redeploy do Vercel com anon key (M1) + **nunca** usar service key em client.
2. **GAP-2 (P2):** `getClientIP` sem `x-real-ip` no chain (Traefik não seta) — corrigido por M3; se o chain mudar (ex.: Cloudflare na frente), o número de hops muda → documentado no código.
3. **GAP-3 (P2):** lockout não gera alerta — só o usuário descobre ao tentar logar. → Watchdog pendente (cron).
4. **GAP-4 (P3):** rate-limit da edge (`60/min`) era GLOBAL (IP=Traefik) — M3 corrige por cliente real.
5. **GAP-5 (P3):** `stop-first` no auth derrubou o login por 8 min no redeploy — corrigido por M4.

## Ordem de execução

1. **Repo (paralelo, worktrees isolados):** M2 (google), M3 (xff), M9 (testes), M10 (docs), M1 (vercel doc).
2. **Infra (paralelo, serviços disjuntos):** M4+M8 (serviço auth), M5 (kong, read-only), M6 (DB), M7 (DB).
3. **Integração:** merge sequencial → gates → PR único.
