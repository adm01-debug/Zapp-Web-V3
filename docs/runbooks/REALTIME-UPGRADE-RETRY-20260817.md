# REALTIME-UPGRADE-RETRY-20260817

**Estado (2026-08-17):** serviço `supabase_realtime` (stack 35) roda v2.124.2 (estável;
mirror do repo = stack file = runtime, todos 124.2). A tentativa de upgrade para v2.128.3
falhou às 12:50Z e o Swarm fez rollback automático (~70s). Causa NÃO determinada (logs
podados ~9 min depois pelo housekeeping) — duas hipóteses:
- H-A (pull failure): primeiro pull bem-sucedido da imagem foi 12:57Z, 6 min após o rollback
  (imagem publicada 07:38Z ainda não propagada).
- H-B (crash de boot): comentário do commit #1166 registra CRASH_BOOT — pgdelta alpha.34
  colide com o fanout do #1148 (aplicado fora do bookkeeping Ecto do realtime).

## Procedimento (quem tiver acesso ao Swarm; NUNCA na onda de merges 12–14h BRT)

1. **Pre-flight (obrigatório):**
   - `docker pull supabase/realtime:v2.128.3` no nó manager e confirmar sucesso ANTES do update.
   - Gate G2: validar boot do 128.3 em ambiente à parte se possível (a causa H-B não é
     eliminada pelo pull pré-validado; reconciliação pgdelta×fanout precisa de verificação).
2. **Update com imagem explícita:**
   `docker service update supabase_realtime --image supabase/realtime:v2.128.3`
   (NUNCA `--rollback` cego pós-rollback — ver regra no AGENTS.md).
3. **Verificação** (ground truth = `docker service ps supabase_realtime` + `UpdateStatus`,
   nunca a resposta do Portainer): `UpdateStatus.State == completed`, task running;
   `GET :4000/healthcheck` = 200; canary WS em tabela particionada (protocolo u10).
4. **Captura de evidência imediata em falha**: logs da task NO MESMO minuto (o housekeeping
   poda em ~9 min — a janela de 12:50 já se perdeu uma vez).
5. **Registro da classe de falha**: DEPLOY_REJEITADO | PULL_FAILURE | CRASH_BOOT |
   STARTED_BROKEN | UNKNOWN.

**Nota:** o fanout (#1148) é workaround complementar — o 128.3 NÃO resolve eventos de
tabelas particionadas (nenhum commit entre 124.2 e 128.3 trata WAL/particionadas, u7).
