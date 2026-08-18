# ADR — Google Calendar: remoção do chamador de front (2026-08-18)

**Status:** Aceito (executado em 2026-08-18)
**Escopo:** MELHORIA 4 (campanha worktree `wt-camp3`)
**Autores:** agente de melhoria 4 (rodada camp3)

## Contexto

A edge `zapp-google-calendar-sync` (contrato G1, 2026-08-17) respondia
`{ synced:false, reason:'not_implemented' }` quando a config
(`zapp.google_calendar_config`) existia com `enabled=true` — um stub explícito
na UI (`src/lib/googleCalendarSync.ts` + `GoogleCalendarIntegration.tsx`,
rota `google-calendar`, item de nav "Calendário"). Regra do dono da campanha:
**nunca deixar stub "not_implemented" na UI — ou construir o sync real, ou
remover o chamador e documentar.**

## Evidência coletada (18/08/2026)

| Fonte | Resultado |
|---|---|
| `supabase/functions/.env.required` | Só `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_REDIRECT_URI` — client OAuth do **Gmail** |
| `gmail-oauth/index.ts` | Scopes hardcoded de Gmail (`gmail.modify/send/...`) — **sem escopo Calendar** |
| DB vivo `zapp.google_calendar_config` | **0 linhas** (integração nunca configurada) |
| DB vivo `zapp.gmail_accounts` | Só contas de teste (`*.local`, `scopes=[]`) — sem token com escopo calendar |
| DB vivo `vault.decrypted_secrets` | Nenhum segredo google/calendar além de `gmail_pubsub_token` |
| Repo (grep `AIza` / API key) | Nenhuma API key Google no repo/env |
| `zapp.google_calendar_config` (migration) | `credentials_json jsonb` previsto para service account — **vazio** |

**Conclusão:** não existem credenciais de Google Calendar no ambiente. A opção
"construir sync real (GET `/calendar/v3/calendars/primary/events`)" exigiria
(1) service account com Calendar API + domain-wide delegation, ou (2) fluxo
OAuth novo com escopo `calendar` — nenhum dos dois tem credencial para
testar, e o consentimento OAuth atual do Gmail não cobre Calendar.

## Decisão

1. **Remover o chamador de front** (stub na UI):
   - `src/lib/googleCalendarSync.ts` — deletado.
   - `src/components/integrations/GoogleCalendarIntegration.tsx` — deletado.
   - `src/pages/lazyViews.ts` — export `GoogleCalendarIntegration` removido.
   - `src/pages/ViewRouter.tsx` — rota `'google-calendar'` removida.
   - `src/components/layout/sidebarNavConfig.ts` — item de nav "Calendário" removido.
2. **Des-stub da edge** `zapp-google-calendar-sync`: nunca mais responde
   `'not_implemented'`; com `enabled=true` mas sem `credentials_json` →
   `{ synced:false, reason:'not_configured', message:'credenciais ausentes' }`.
   Edge mantida (registrada em CONTRACTS/CONTRACT_SCHEMAS/EDGE_FUNCTION_NAMES)
   como endpoint de status honesto.
3. **ADR documentado** neste arquivo.

## Caminho de re-ativação (quando houver credenciais)

1. Inserir service account em `zapp.google_calendar_config.credentials_json`
   (escrita exige `service_role`; leitura admin/supervisor) e `enabled=true`
   (ou implementar OAuth per-user com escopo `https://www.googleapis.com/auth/calendar`).
2. Implementar o pipeline de sync na edge: JWT RS256 do service account →
   `POST https://oauth2.googleapis.com/token` → `GET /calendar/v3/calendars/{id}/events`
   → retornar lista `{ synced:true, events:[...] }` (contrato SEMPRE 200).
3. Reexpor a UI (helper + componente + rota + nav) apenas com o sync real
   funcionando e testado contra as credenciais reais.

## Consequências

- Sem stub na UI: a integração só reaparece quando houver backend real.
- `check-edge-function-sync.sh` continua válido (nenhum `invoke` órfão de
  `zapp-google-calendar-sync` no front).
- `CONTRACT_SCHEMAS['zapp-google-calendar-sync']` permanece registrado
  (schema `{ dryRun? }` — compatível com GET sem body).
