# Watchdog — Bucket whatsapp-media público (proposta, não aplicada)

- **Status:** PROPOSTA — aguardando revisão/merge. Nada foi aplicado em produção.
- **Data:** 2026-08-06
- **Branch:** `scripts/media-verification` (worktree `C:/zapp-web-v3-wt-sql`, HEAD `a963b496f`)
- **Arquivos desta proposta:**
  - `scripts/sql/media-bucket-verification.sql` — queries read-only de verificação/monitoramento do storage
  - `docs/watchdog-bucket-public-20260806.md` — este documento (spec do guard)
- **Referências:**
  - Incidente BUG-MEDIA-20260806 (bucket `whatsapp-media` privado por engano; 18.494 objetos inacessíveis; storm de refresh no frontend) — fix em `supabase/migrations/20260806193000_whatsapp_media_bucket_public.sql`
  - Migrations de origem do problema: `20260801060001` (LGPD P0-4, privou o bucket) e `20260804000000` (canonical, re-aplicou BUG-38 em `audio-messages`)
  - `docs/ADR-004_REVOGA_BUCKET_PUBLICO.md` (histórico: whatsapp-media já foi privado por LGPD; a decisão atual pós-incidente é público — ver §9)
  - Padrão de guard da casa: `.hermes/reconciliation/guardrail/` (`guardrail-reconcile.sh`, cron `*/15`, `grep ALERTA`, exit 0) + `scripts/sql/check-reference-integrity.sql` (gate fail-closed)

---

## 1) Contexto e objetivo

O incidente de 2026-08-06 mostrou que **nenhum guardrail cobria `storage.buckets.public`**: o flag foi alterado para `false` por uma migration LGPD e a stack inteira (edge functions `_shared/evolution-media.ts` via `getStoragePublicUrl` + frontend) quebrou por horas até a detecção manual.

Objetivo do guard: **detectar regressão do flag público em ≤ 15 minutos** (janela do cron) e expor sinais secundários de saúde do storage (órfãos, contagem de objetos), sem nunca escrever no banco.

Estado esperado codificado (fonte: migrations):

| public=true (públicos por design) | public=false (privados por design) |
|---|---|
| `whatsapp-media`, `audio-messages`, `avatars`, `custom-emojis`, `recibos-entrega`, `stickers` | `audio-memes`, `comprovantes-financeiro`, `email-attachments`, `etiquetas-remessa`, `fechamentos`, `quarantine`, `team-chat-files` |

---

## 2) Design proposto (container guard)

Seguindo o padrão da casa (guardrail-reconcile: cron no host + saída `OK|ALERTA` + `grep ALERTA` + exit 0 sempre), com a diferença de rodar num **container descartável `postgres:15-alpine`** (psql nativo) em vez de `docker exec` no `supabase_db` — menos acoplamento ao container do banco e nenhuma instalação extra na VPS.

**Componentes:**

| Item | Proposta |
|---|---|
| Imagem | `postgres:15-alpine` (só psql; sem servidor iniciado) |
| Execução | cron do host `*/15 * * * *` → `/opt/watchdog-bucket-public/run.sh` |
| SQL | `scripts/sql/media-bucket-verification.sql` copiado para `/opt/watchdog-bucket-public/` (montado `:ro` no container) |
| Credenciais | env-file `/run/secrets/supabase_db_url_env` (600, root) com `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE` — **nunca** URL completa em linha de comando (vazaria no `ps`/argv) |
| Role | `supabase_read_only_user` (já existe na casa) — menor privilégio |
| Log | `/var/log/watchdog-bucket-public.log` + logrotate (rotate 14, diário, compress — igual guardrail-reconcile) |
| Rede | container `--rm`, sem portas, `--network` da stack do banco (ou host), read-only |

**Esboço do `run.sh` (exit 0 SEMPRE; alerta por texto):**

```bash
#!/usr/bin/env bash
# watchdog-bucket-public — gate do storage (BUG-MEDIA-20260806)
# Padrao da casa: exit 0 SEMPRE; alerta detectado por 'grep ALERTA'.
set -u

TS="$(date -Iseconds)"
ENV_FILE="${SUPABASE_DB_URL_ENV_FILE:-/run/secrets/supabase_db_url_env}"
SQL_FILE="${GATE_SQL_FILE:-/opt/watchdog-bucket-public/media-bucket-verification.sql}"

if [ ! -r "$ENV_FILE" ]; then
  echo "$TS ALERTA BUCKET-01: env-file de conexao indisponivel ($ENV_FILE)"
  exit 0
fi
if [ ! -r "$SQL_FILE" ]; then
  echo "$TS ALERTA BUCKET-01: arquivo SQL indisponivel ($SQL_FILE)"
  exit 0
fi

OUT="$(docker run --rm --env-file "$ENV_FILE" \
  -v "$SQL_FILE:/check.sql:ro" \
  postgres:15-alpine \
  psql -v ON_ERROR_STOP=1 -f /check.sql 2>&1)"
RC=$?

if echo "$OUT" | grep -q 'MEDIA_BUCKET_REGRESSION'; then
  echo "$TS ALERTA BUCKET-01: regressao detectada (bucket privado indevidamente):"
  echo "$OUT" | grep 'MEDIA_BUCKET_REGRESSION' | sed 's/^/  /'
elif [ "$RC" -ne 0 ]; then
  echo "$TS ALERTA BUCKET-01: erro ao executar o gate (psql rc=$RC)"
  echo "$OUT" | tail -5 | sed 's/^/  /'
elif echo "$OUT" | grep -q 'MEDIA_BUCKET_VERIFICATION_OK'; then
  echo "$TS OK BUCKET-01: whatsapp-media e audio-messages public=true"
else
  echo "$TS ALERTA BUCKET-01: saida inesperada do gate (sem marcador OK)"
fi

exit 0
```

> **Nota sobre as seções pesadas:** o `run.sh` roda o arquivo completo (seções A–D são baratas **exceto** B e C, que fazem full scan de `media_url` na view `zapp.messages`). Para a cadência de 15 min, o ideal é extrair apenas as seções E+G num arquivo `gate-bucket-public.sql` versionado (follow-up desta branch) e deixar o arquivo completo para diagnóstico sob demanda. O esboço acima assume o arquivo completo **somente se** B/C forem extraídas; alternativamente, manter o arquivo completo com cadência diária e usar `-c` com a query da seção E no cron de 15 min (transcrição da seção G, com nota de sincronia).

---

## 3) Checks do guard

| ID | Fonte (seção do SQL) | Cadência | Alerta quando |
|---|---|---|---|
| BUCKET-01 | E + G (gate fail-closed) | `*/15` | `public=false` em `whatsapp-media`/`audio-messages`; erro de conexão/psql; saída sem marcador |
| BUCKET-02 | A2 (matriz de intenção) | `*/15` (leve: 13 linhas) | qualquer `DRIFT` (bucket público virou privado **ou** privado-por-design virou público = exposição LGPD) ou `MISSING` |
| BUCKET-03 | C2 (órfãos por bucket) | 1x/dia (baixo tráfego) | órfãos > threshold (sugestão inicial: > 50; calibrar com baseline) |
| BUCKET-04 | D (objetos por bucket) | 1x/dia | `object_count = 0` em bucket público de mídia (sinal de bucket recriado/vazio; baseline atual ~18.494 em whatsapp-media) |

Saída padrão (uma linha por check, timestamp ISO no início):

```
2026-08-06T14:00:00-03:00 OK BUCKET-01: whatsapp-media e audio-messages public=true
2026-08-06T14:00:00-03:00 ALERTA BUCKET-02: DRIFT em 'whatsapp-media' (esperado=true, atual=false)
2026-08-06T14:00:00-03:00 INFO RESUMO: 1 OK, 1 ALERTA
```

---

## 4) Regras de saída (padrão da casa)

- **Exit code SEMPRE 0** — alerta é detectado por texto (`grep ALERTA /var/log/watchdog-bucket-public.log`); o cron não "falha" por causa do watchdog.
- **SEM `set -e`** no run.sh — falha de check vira ALERTA com motivo; os demais checks seguem.
- `set -u` + config por env vars com defaults (`${VAR:-default}`) — mesmo script serve VPS/dev.
- **Degradação:** env-file/SQL/container indisponível → ALERTA com motivo, nunca OK falso nem crash.
- **Segredos:** nunca imprimir a connection string; usar env-file com permissão 600.

---

## 5) Pré-requisitos (a validar antes de ativar)

1. **Grants do role `supabase_read_only_user`:** SELECT em `storage.buckets`, `storage.objects`, `zapp.messages` **e** nas tabelas base da view — `zapp.messages` é view `security_invoker=true` (chain `public.messages → zapp.messages → evo.evolution_messages`), ou seja, as permissões são checadas como o role que consulta; sem SELECT em `evo.evolution_messages` o gate falha com `permission denied`.
2. **Secret/env-file:** criar `/run/secrets/supabase_db_url_env` (ou equivalente Swarm secret) apontando para o banco com o role read-only.
3. **Decisão de cadência** das seções pesadas (B/C) — ver nota do §2.

---

## 6) Passos de implantação (proposta — NÃO executar agora)

1. Revisar e mergear a branch `scripts/media-verification` (PR com o SQL + este doc).
2. Validar os grants do §5 e criar o env-file na VPS.
3. Copiar `scripts/sql/media-bucket-verification.sql` para `/opt/watchdog-bucket-public/` (owner root, 644).
4. Instalar `run.sh` (root, 700) + cron `*/15 * * * * root /opt/watchdog-bucket-public/run.sh >> /var/log/watchdog-bucket-public.log 2>&1` + logrotate (rotate 14).
5. **Smoke test real do gate (sem COMMIT):** `BEGIN; UPDATE storage.buckets SET public=false WHERE name='whatsapp-media';` → rodar o gate → conferir `MEDIA_BUCKET_REGRESSION`/exit≠0 → `ROLLBACK`. Em seguida rodar o gate limpo → `MEDIA_BUCKET_VERIFICATION_OK`. (Se houver staging, fazer o teste lá.)
6. Verificação pós-ativação: aguardar 1h e conferir linhas `OK BUCKET-01` no log + ausência de `ALERTA`.

---

## 7) Rollback

Remover o cron, apagar `/opt/watchdog-bucket-public/` e o log. O guard **nunca escreve no banco** (read-only), então não há estado a reverter em produção.

---

## 8) Limitações e riscos

- **O gate codifica a decisão ATUAL (público).** Se a stack migrar para signed URLs (plano da ADR-004), a expectativa inverte (`public=false`) e o gate precisa ser atualizado **na mesma PR** da migration que mudar o flag — adicionar ao checklist de deploy de storage.
- **Falso negativo em URL malformada:** nas seções B/C, URL com query string/encoding incompatível não casa o regex e cai fora (não vira falso órfão, mas também não é contada) — comportamento intencional, documentado no SQL.
- **Custo das seções B/C:** full scan sobre `media_url` na view sem índice — por isso a proposta de cadência diária/manual (BUCKET-03), nunca no ciclo de 15 min.
- **Role read-only:** se o `supabase_read_only_user` não tiver os grants do §5, BUCKET-01 degrada para ALERTA de conexão/permissão — correto por design (nunca OK falso), mas exige o pré-requisito.

---

## 9) Alinhamento com a casa

- **Guardrail único (CONSOLIDACAO.md, 05/08):** a casa consolidou os guardrails no `guardrail-reconcile.sh` (VPS). Este guard nasce como componente separado (conforme solicitado: container `postgres:15-alpine` + psql + cron), mas pode ser **absorvido depois** como check no guardrail-reconcile (ex.: `BUCKET-01` vira check no script consolidado, usando `docker exec supabase_db psql` — o mesmo SQL serve). Decisão a registrar no próximo ciclo de consolidação.
- **Gate de CI (opcional, complementar):** o mesmo `media-bucket-verification.sql` já é fail-closed (seções E+G) e pode ser plugado num workflow GH Actions no molde do `db-reference-integrity.yml` (`secrets.SUPABASE_DB_URL` + `psql -v ON_ERROR_STOP=1 -f scripts/sql/media-bucket-verification.sql`, fail-open só quando o secret não existe). Útil para bloquear PRs que alterem `storage.buckets` para `false`.
- **ADR-004:** registra que `whatsapp-media` foi privado por LGPD em 26/07 e revertido pelo fix de 06/08 (BUG-MEDIA). O estado esperado deste guard reflete a decisão vigente pós-incidente; a ADR-004 segue válida como direção futura (signed URLs), com o alerta do §8.
