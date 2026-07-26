# LGPD IMPACT ASSESSMENT — Token Exposure & Public Bucket

**Date:** 2026-07-26
**Assessor:** DPO / Security Team
**Status:** IN PROGRESS

---

## INCIDENT TIMELINE

| Date | Event | Data Subject Impact |
|-------|-------|-------------------|
| 2026-07-14 18:39 | Token exposto em `.mcp.json` | POTENCIAL |
| 2026-07-14 18:39 | Bucket `whatsapp-media` público (ADR-002) | POTENCIAL |
| 2026-07-26 18:38 | Token removido, Bucket masih público | POTENCIAL |
| 2026-07-26 | Incident response initiated | — |

---

## EXPOSURE ANALYSIS

### What Was Exposed

1. **Supabase Service Role Key**
   - Full database access
   - All tables including `evo.evolution_media`
   - Storage operations

2. **Bucket whatsapp-media (Público)**
   - ~2,500+ media files
   - Images, videos, documents from WhatsApp conversations
   - No authentication required

### Data Categories at Risk

| Category | Volume | LGPD Sensitivity | Impact |
|----------|--------|------------------|--------|
| WhatsApp Messages | ~2,500 | 🔴 HIGH | Conteúdo de conversas |
| Evolution Media | ~2,500 | 🔴 HIGH | Mídia de clientes |
| Contact Photos | Unknown | 🔴 HIGH | Imagens pessoais |
| Business Documents | Unknown | 🔴 HIGH | Contratos, notas fiscais |

---

## LGPD OBLIGATIONS

### Article 48 — Notification to ANPD
Se houve acesso não autorizado a dados pessoais, deve notificar a ANPD **em até 2 dias úteis**.

### Indicadores de Acesso Não Autorizado
- [ ] Verificar logs de acesso ao Supabase (auth.audit_log_entries)
- [ ] Verificar logs de storage (supabase_storage.objects)
- [ ] Verificar access logs do Cloudflare/MCP

### Article 42 — Liability
Se dados foram expostos, a empresa pode ser responsabilizada por danos materiais, morais, ou coletivos.

---

## REQUIRED ACTIONS

### Immediate (24h)
- [ ] Verificar logs de acesso: houve acesso não autorizado?
- [ ] Identificar escopo: quais dados podem ter sido acessados?
- [ ] Documentar findings

### Short-term (72h)
- [ ] Avaliar necessidade de notificação à ANPD
- [ ] Avaliar necessidade de notificação aos titulares
- [ ] Documentar decisão

### Remediation
- [ ] Rotacionar token exposto
- [ ] Reverter bucket público
- [ ] Implementar controles técnicos

---

## DOCUMENTATION

Maintain this record for:
1. **ANPD audit** (if notification required)
2. **Legal defense** (demonstrar resposta adequada)
3. **Process improvement** (prevenir recorrências)

---

*Document Status: ACTIVE — Awaiting DPO assessment*
