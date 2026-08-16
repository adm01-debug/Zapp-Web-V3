# E83 — Monitoria: Decisões sobre Gaps (Paridade Cloud)

> Status: **MONITORANDO** · Data: 2026-08-16
> Escopo: gaps levantados na monitoria E83 (paridade fake×evolution 12/12 verde; paridade cloud pendente — ver `RETROSPECTIVA_FINAL_100_ETAPAS.md`).

## Decisões

### 1. Gap 1 — Replay de DLQ cloud-aware → ✅ FECHADO
- **Decisão:** FECHADO no patch do agente **E1** (replay de DLQ agora é cloud-aware: reconhece a origem/produtor do evento e roteia o replay para o provider correto, sem assumir Evolution por padrão).
- **Referência:** patch do agente E1 (registro de execução do E1) + `ADR-011-egress-gateway.md` (porta oficial P3, ingestão de eventos com HMAC + DLQ).
- **Verificação:** nenhuma ação de monitoria pendente para este gap.

### 2. Gap 2 — Status `PENDING` fixo → 🚫 NÃO-GAP (monitorado)
- **Decisão:** NÃO-GAP, porém **monitorado**.
- **Por quê:** o status `PENDING` fixo é consequência de **não haver webhook de entrega do cloud mapeado** — o cloud (Meta Graph API) não notifica status de entrega/leitura no fluxo atual, então o valor permanece estático. Não é bug do consumer nem do adapter.
- **Ação futura:** **quando o cloud real for ativado (E92)**, mapear os statuses de entrega do webhook cloud (delivered/read/failed) e propagá-los ao ledger.

### 3. Gap 3 — Read fora do ledger → 🚫 NÃO-GAP (idempotente)
- **Decisão:** NÃO-GAP por **idempotência**.
- **Por quê:** o read fora do ledger é **best-effort por natureza**: o dado pode ser reconstruído/relido sem corromper estado, pois o ledger é a fonte de verdade e reads externos são consultivos.
- **Ação futura:** **alertar se reads falharem** de forma consistente (falha de leitura contínua vira sintoma real de saúde do provider/ledger — aí sim abrir gap).

## Trigger de reabertura

- **Reabrir gaps 2 e 3 quando:** **E92 ativar o cloud real** (ensaio evolution→cloud com credenciais Meta `WHATSAPP_CLOUD_PHONE_ID`/`WHATSAPP_CLOUD_TOKEN` — hoje aguardando, ver `RUNBOOK_TROCA_PROVIDER.md`).
  - Gap 2 → mapear statuses de entrega do webhook cloud para o ledger.
  - Gap 3 → reavaliar reads fora do ledger com o provider cloud ativo.

## Resumo

| Gap | Veredito | Ação |
|---|---|---|
| 1. Replay DLQ cloud-aware | ✅ FECHADO (patch E1) | — |
| 2. Status PENDING fixo | 🚫 NÃO-GAP monitorado | Mapear statuses quando E92 ativar cloud |
| 3. Read fora do ledger | 🚫 NÃO-GAP (idempotente) | Alerta se reads falharem |
