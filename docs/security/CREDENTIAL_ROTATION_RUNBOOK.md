# RUNBOOK DE EMERGENCIA - Rotacao de Credenciais

## Token Comprometido

1. Revogar imediatamente no servico afetado
2. Atualizar nos secrets do GitHub
3. Atualizar no Portainer/VPS
4. Notificar equipe
5. Documentar o incidente

## Evolution API Key

- Portainer > stack evolution > env AUTHENTICATION_API_KEY
- Atualizar: zapp.whatsapp_connections, evo.evolution_instance_credentials
- Credencial n8n: <REDACTED — rotacionar via n8n UI>

## Supabase JWT

- Portainer > stack supabase > env JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY
- Propagar: Vercel env, Edge Functions secrets, n8n
- JANELA DE MANUTENCAO obrigatoria

## GitHub PAT

- github.com > Settings > Developer settings > PAT
- Atualizar no VPS: git remote set-url origin https://TOKEN@github.com/...

## Validacao pos-rotacao

SELECT * FROM zapp.v_security_posture;
-- Esperado: security_score=10, grade=EXCELENTE
