> ⚠️ SUPERSEDED (2026-07-15): This ADR described the dual-Supabase architecture. The project now uses a single self-hosted Supabase (schema zapp/evo). See externalClient.ts shim.

# ADR-006: Two-Backend Boundary & Communication

> **Arquitetura atual**: Supabase Self-Hosted (`supabase.atomicabr.com.br`), schema `zapp`. Veja [../SCHEMA_REFERENCE.md](SCHEMA_REFERENCE.md).


## Status
Implementado

## Contexto
O projeto utiliza dois backends Supabase: Lovable Cloud (Interno) e Evolution DB (Externo). É necessário definir regras claras de comunicação.

## Decisões
1. **Separação de Clientes**: `supabase` para auth/perfis; `externalClient` para CRM/WhatsApp.
2. **Zero Cross-JOINs**: Comunicação via IDs no frontend. Nunca tentar JOINs via SQL entre os dois bancos.
3. **RPC First**: Toda escrita no Evolution DB deve ser via RPC `SECURITY DEFINER` para garantir integridade e RLS bypass controlado.
4. **JWT Validation**: O `externalClient` deve passar o JWT do usuário logado no Lovable Cloud para o Evolution DB validar a identidade.

## Consequências
- Código desacoplado.
- Facilidade em migrar um dos backends independentemente.


---

## Situação pós-desacoplamento (2026-08-13)

Este ADR foi **superseded em 2026-07-15** pela consolidação em único Supabase self-hosted.
Pós-desacoplamento de 2026-08-12/13, a fronteira operacional é descrita por:

- **[ADR-009: Gateway Pattern](../decouple/ADR-009-gateway-pattern.md)** — toda saída HTTP para Evolution via gateway canônico
- **[docs/BOUNDARY-evolution.md](../BOUNDARY-evolution.md)** — o que fica em cada repo
- **[ADR-DB-002](../db/adrs/ADR-DB-002-fronteira-zapp-evo.md)** — fronteira de schema `evo` × `zapp`

`callEvolutionApi` (descrito neste ADR como "RPC First") foi removido de runtime em 2026-08-13.
Presente apenas em mocks de teste legado (`whatsappConnectionRepository.test.ts`).
