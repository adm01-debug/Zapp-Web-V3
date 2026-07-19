# ADR-006: Two-Backend Boundary & Communication

> **Arquitetura atual**: Supabase Self-Hosted (`supabase.atomicabr.com.br`), schema `zapp`. Veja [../SCHEMA_REFERENCE.md](SCHEMA_REFERENCE.md).


## Status
Implementado

## Contexto
O projeto utiliza dois backends Supabase: Lovable Cloud (Interno) e FATOR X (Externo). É necessário definir regras claras de comunicação.

## Decisões
1. **Separação de Clientes**: `supabase` para auth/perfis; `externalClient` para CRM/WhatsApp.
2. **Zero Cross-JOINs**: Comunicação via IDs no frontend. Nunca tentar JOINs via SQL entre os dois bancos.
3. **RPC First**: Toda escrita no FATOR X deve ser via RPC `SECURITY DEFINER` para garantir integridade e RLS bypass controlado.
4. **JWT Validation**: O `externalClient` deve passar o JWT do usuário logado no Lovable Cloud para o FATOR X validar a identidade.

## Consequências
- Código desacoplado.
- Facilidade em migrar um dos backends independentemente.
