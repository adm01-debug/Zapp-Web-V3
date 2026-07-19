# Procedimento de Rotação da Anon Key

> **Arquitetura atual**: Supabase Self-Hosted (`supabase.atomicabr.com.br`), schema `zapp`. Veja [SCHEMA_REFERENCE.md](SCHEMA_REFERENCE.md).


## Status: PENDENTE (requer janela de manutenção)

## Por que rotacionar?
A anon key do Supabase Cloud (`allrjhkpuscmgbsnmjlv`) estava exposta no Git.
A key do self-hosted na VPS é diferente e não foi comprometida.

## Passos para rotação segura:
1. Gerar nova anon key JWT no self-hosted
2. Atualizar `.env.local` com a nova key
3. Atualizar Kong gateway config
4. Deploy do frontend com a nova key
5. Verificar que todas as conexões funcionam
6. Invalidar a key antiga

## Risco: MÉDIO
- A key atual do self-hosted NÃO foi exposta no Git
- A key exposta era do Supabase Cloud (já desconectado)
- Rotação pode ser feita em janela de manutenção programada

## Data sugerida: Próxima janela de manutenção
