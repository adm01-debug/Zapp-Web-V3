# Re-tentativa do realtime v2.128.3 (procedimento)

**Estado (2026-08-17):** serviço `supabase_realtime` roda v2.124.2 (estável). A tentativa de
upgrade para v2.128.3 falhou às 12:50Z e o Swarm fez rollback automático. Causa provável
(u1): **pull failure** — o primeiro pull bem-sucedido da imagem foi 12:57Z, 6 min após o
rollback (imagem publicada às 07:38Z ainda não propagada).

## Procedimento (quem tiver acesso ao Swarm)

1. **Pull pré-validado** (obrigatório): `docker pull supabase/realtime:v2.128.3` no nó
   manager e confirmar sucesso ANTES do update.
2. **Update com imagem explícita**: `docker service update supabase_realtime --image
   supabase/realtime:v2.128.3` (nunca `--rollback` cego pós-rollback — ver regra no AGENTS.md).
3. **Verificação** (ground truth = `docker service ps supabase_realtime`, nunca a resposta
   do Portainer): `UpdateStatus.State == completed` e task running; health HTTP
   `GET :4000/healthcheck` = 200; canary WS em tabela particionada (protocolo u10).
4. **Falha**: registrar classe (DEPLOY_REJEITADO | PULL_FAILURE | CRASH_BOOT |
   STARTED_BROKEN | UNKNOWN) e reabrir análise.

**Nota:** o fanout (#1148) é workaround complementar — o 128.3 NÃO resolve eventos de
tabelas particionadas (nenhum commit entre 124.2 e 128.3 trata WAL/particionadas, u7).
