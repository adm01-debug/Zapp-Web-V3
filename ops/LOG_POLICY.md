# Política de Log — AtomicaBR / Evolution API
## Aprovada: 2026-08-08 (etapa-93 auditoria exaustiva)

### Princípio
**Nenhum log de produção pode conter corpo de mensagem WhatsApp ou dado pessoal.**

### Dados proibidos em logs

| Dado | Classificação LGPD | Ação |
|---|---|---|
| `message.conversation` | Dado pessoal / conteúdo privado | MASCARAR ou SUPRIMIR |
| `pushName` | Dado de identificação | MASCARAR |
| Número de telefone completo | Dado pessoal de contato | MASCARAR (manter prefixo 4 dígitos para debug) |
| `agentId` | UUID interno | MASCARAR em logs externos |
| `apikey` / `x-api-key` | Credencial | MASCARAR (T4 v1 — já ativo) |

### Implementação atual

- **T4 v1** (build-time, ativo): mascara `apikey`/`x-api-key` via regex em `dist/main.js`
- **T4 v2** (ops/t4_prologue_v2.cjs — pendente próximo build): estende T4 v1 com:
  - `conversation`, `pushName`, `agentId` reduzidos
  - `remoteJid` truncado (4 dígitos + XXXX)
  - Objetos `WebMessageInfo` detectados pelo shape e colapsados em `[WebMessageInfo:MASKED key=...]`

### Build gate

O Dockerfile DEVE:
1. Copiar `ops/t4_prologue_v2.cjs` como config build-time
2. Prepend ao `dist/main.js` gerado
3. Verificar no VERIFY step que nenhum dos patterns proibidos aparece na saída de `console.log` mockado

### Teste de aceite

```bash
# Não deve aparecer nenhuma das strings:
docker logs evolution_evolution.1.* 2>&1 | grep -E 'conversation|pushName|@s.whatsapp.net' | wc -l
# Esperado: 0
```

### Retenção e expurgo

Os logs Docker acumulados ANTES da T4 v2 podem conter PII.
- Driver de log: local (padrão Docker)
- Rotação: `traefik_log-rotate` roda diariamente
- Ação pendente: avaliar retenção máxima de 7 dias nos drivers de log de todos os containers
  que recebem dados WhatsApp (evolution, zapp-web-prod, hermes)

### Responsável técnico

adm01@promobrindes.com.br / Joaquim Ataides
