# ADR-004: Revogação do Bucket Público — whatsapp-media

**Status:** PROPOSTA — CRÍTICO
**Data:** 2026-07-26
**Decisor:** Engineering Team

---

## Contexto

Em 2026-07-26, durante a auditoria de segurança, foi identificado que o bucket `whatsapp-media` foi configurado como **PÚBLICO** na ADR-002. Esta decisão expõe mídia de clientes (imagens, vídeos, documentos) sem autenticação.

### Problema Identificado

1. **LGPD Compliance**: Mídia de conversas de WhatsApp Business contém dados pessoais de clientes. Disponibilizar sem autenticação viola a base legal de tratamento.

2. **Segurança por Obscuridade**: A ADR-002 justifica que "paths são hash-derivados" — isso não é segurança real.

3. **Risco de Vazamento**: Qualquer pessoa com acesso às URLs (que estão no banco de dados) pode acessar as mídias.

4. **Incidente de Token Exposto**: Com o token do Supabase MCP exposto (2026-07-14 a 2026-07-26), há risco de acesso não autorizado a mídias.

## Decisão

**O bucket `whatsapp-media` deve voltar a ser PRIVADO.**

### Solução Alternativa para N+1 de URLs

Em vez de bucket público, implementar:

1. **URLs Assinadas em Lote (Batch Signing)**
   - Assinar múltiplas URLs de uma vez
   - Cache de URLs assinadas por 50 minutos
   - Elimina N+1 de ~450 POSTs por page load

2. **Proxy CDN Autenticado** (alternativa)
   - `zapp-media-proxy.adm01.workers.dev` já existe
   - Cache na CDN com TTL curto
   - Autenticação via header

## Ação Requerida

```sql
-- Verificar status atual do bucket
SELECT id, name, public FROM storage.buckets WHERE name = 'whatsapp-media';

-- Reverter para privado
UPDATE storage.buckets SET public = false WHERE name = 'whatsapp-media';
```

**Responsável:** DevOps
**Prazo:** Imediato
**Validação:**
- `SELECT public FROM storage.buckets WHERE name='whatsapp-media'` → `false`
- Teste de acesso anônimo → 403 Forbidden

---

## Consequências da Reversão

### Positivas
- Conformidade LGPD
- Mídia protegida por autenticação
- URLs só acessíveis com credenciais válidas

### Negativas
- Precisa implementar batch signing se N+1 persistir
- Pode impactar performance se não otimizado

---

*Esta ADR revoga a decisão da ADR-002.*
