# Corte duro para Supabase self-hosted

Objetivo: parar de usar o backend Lovable Cloud (`uqysyzndkfiwfztbqvsl.supabase.co`) e apontar 100% do app para o self-hosted (`SELFHOSTED_SUPABASE_URL`). Aceito: relogin obrigatório de todos os usuários, janela de instabilidade durante o cutover, alto risco de regressão em módulos não cobertos por teste.

## Pré-requisitos (você faz manualmente)

1. **Workspace Settings → Build Secrets** — adicionar duas variáveis (nomes exatos, com prefixo `VITE_`):
   - `VITE_SUPABASE_URL` = https://supabase.atomicabr.com.br
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = <REDACTED-service_role-JWT>

   Isso sobrescreve o `.env` auto-gerenciado em tempo de build sem eu precisar editar o arquivo (que é imutável). É o único caminho para o client oficial (`src/integrations/supabase/client.ts`, auto-gerado) apontar para o self-hosted sem refactor de 300+ imports.

2. Confirmar que o self-hosted tem:
   - `auth.users` com o mesmo esquema e (se possível) os mesmos hashes bcrypt — senão todo mundo precisa fazer "esqueci minha senha".
   - Buckets de storage com o mesmo nome (`avatars`, `stickers`, `media`, `audio-memes`, `whatsapp-media`, `knowledge-base`, etc.) e o mesmo conteúdo.
   - As ~120 edge functions publicadas com `supabase functions deploy` na VPS.
   - Extensões `pgcrypto`, `pg_net`, `pg_cron`, `http`, `vector` habilitadas.
   - `app.encryption_key` e `app.settings.service_role_key` configurados (usados por `decrypt_gmail_token` e `notify_sicoob_on_reply`).

## Fase 1 — Reconciliação de secrets (backend, no meu lado)

- Deletar duplicatas: `EXTERNAL_SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY` (padrão antigo) e `SELFHOSTED_SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY` (o que salvamos agora) — manter apenas um conjunto canônico. Proposta: manter `SELFHOSTED_*` como referência humana, mas usar os valores para popular os secrets internos que o Supabase Runtime injeta nas edge functions.
- Como `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` são injetados automaticamente pela Lovable Cloud e não posso sobrescrevê-los, criar wrapper `_shared/supabase-runtime.ts` que resolve para `SELFHOSTED_*` quando presentes e cai para os padrões só em fallback. Substituir importações nas ~120 functions.

## Fase 2 — Frontend (dual-write eliminado)

- Deprecar `src/integrations/supabase/externalClient.ts` — agora o client principal já é o self-hosted, então `externalSupabase` vira alias do `supabase`. Manter export para não quebrar imports existentes.
- Deprecar `src/lib/externalProxy.ts` e `src/hooks/useExternalDB.ts` — chamadas passam a ser diretas.
- Remover `USE_EXTERNAL_ONLY` como feature flag (agora é sempre true, implicitamente).
- Auditar componentes que assumem duas fontes (`BridgeSupabaseView`, `AdminBridgeStatusPage`, `AdminExternalDbExplorerPage`, `useExternalDB`): virar somente-leitura ou remover a UI de "espelhamento".

## Fase 3 — Edge functions (repontar todas)

- Grep de `Deno.env.get('SUPABASE_URL')` / `SUPABASE_SERVICE_ROLE_KEY` em `supabase/functions/**` → substituir por `getSelfhostedRuntime()` do wrapper novo.
- Reprocessar CORS: adicionar o domínio de produção do Lovable no allow-list se o self-hosted usar CORS restrito.
- Functions que fazem `auth.getUser()` com JWT: passar a validar contra o JWKS do self-hosted (`https://<selfhosted>/auth/v1/keys`).
- Functions que gravam em `auth.users` diretamente (raras): revisar se ainda funcionam via service_role do self-hosted.

## Fase 4 — Deploy e cutover

1. Merge dos patches acima em uma única publicação.
2. Você publica pelo Lovable → build lê os Build Secrets → bundle sai apontando para o self-hosted.
3. Todo usuário logado é deslogado ao próximo request (JWT do Cloud não valida no self-hosted).
4. Sessões de realtime caem e reconectam no novo websocket.
5. Uploads em andamento para o storage do Cloud são perdidos.

## Fase 5 — Verificação

- Login com um usuário de teste do self-hosted.
- Listar contatos, mensagens, filas — validar RLS.
- Enviar mensagem WhatsApp via Evolution (verifica edge function + realtime).
- Upload de sticker (verifica storage).
- Chamada de RPC `has_role`, `is_admin_or_supervisor`, `fn_list_audio_memes_for_user`.
- Abrir `/admin/webhook-events` — confirmar que webhooks entram no self-hosted.

## Rollback

Reverter os dois Build Secrets do Workspace para os valores originais do Cloud e republicar. Rollback total em ~2min.

## O que fica quebrado (aceito por você)

- Todos os usuários fazem login de novo.
- Se o self-hosted não tiver espelho perfeito de `auth.users` com hashes, precisam de "esqueci minha senha".
- Edge functions que dependem de secrets configurados apenas no Cloud (não portados) falham até serem redeployadas na VPS.
- Storage: arquivos que não foram espelhados retornam 404.
- `analytics` do Lovable Cloud, `edge_function_logs` do Cloud e ferramentas Lovable (`supabase--linter`, `supabase--read_query`) continuam apontando ao Cloud — perdem utilidade prática.
- MCP OAuth server (`.lovable/oauth/consent`) precisa ser reconfigurado apontando ao issuer do self-hosted.

## Detalhes técnicos

- **Arquivo `.env`**: não posso editar. Uso Build Secrets do Workspace para sobrescrever `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no momento do `bun run build`.
- **`src/integrations/supabase/client.ts`**: auto-gerado, não posso editar; mas como ele lê `import.meta.env.VITE_SUPABASE_URL`, o Build Secret substitui o valor em runtime sem precisar tocar no arquivo.
- **`src/integrations/supabase/types.ts`**: continua válido — assume que o schema do self-hosted é idêntico ao Cloud (você confirmou espelhamento 100%).
- **`supabase/config.toml`**: continua com `project_id = "uqysyzndkfiwfztbqvsl"` — isso só afeta as ferramentas Lovable, não o runtime da app.
- **Nenhuma migração SQL neste plano** — assumindo espelho já validado.

## Estimativa

- Alterações de código: ~40 arquivos (frontend deprecation + wrapper edge function + ~120 functions com grep/replace mecânico).
- Tempo de build: normal.
- Downtime funcional: ~5-15min para você validar antes de anunciar.

Confirme e eu executo em build mode. Se quiser reduzir escopo (ex: só frontend, deixar edge functions no Cloud), me avise antes.
