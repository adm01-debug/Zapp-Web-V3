# SIMULAÇÃO DE CENÁRIOS — Pre-mortem da Auditoria de Reconciliação (100 etapas)

> Data: 2026-08-04 · Autor: Hermes Agent (coordenação) · Método: pre-mortem + matriz de falhas
> Ambiente: Docker Swarm single-node VPS · Supabase self-hosted PG 15.8 · Front zapp-web · Edge functions (117)
> Repo: adm01-debug/zapp-web-v3 @ a1d01703 · DB = fonte de verdade de objetos (DDL via MCP é o fluxo real)

## 1. Simulação de falhas de RUNTIME (cenários de impacto)

| # | Cenário simulado | Gatilho provável | Impacto previsto | Detecção (checagem) | Mitigação | Rollback |
|---|---|---|---|---|---|---|
| S01 | **JWT secret divergente** entre auth/rest/storage/functions/realtime | Rotação parcial feita à mão em um container | 🔴 P0 — todo login/API quebra: 401 em todas as rotas JWT | Fingerprint `sha256|cut -c1-12` de `*_JWT_SECRET` em todos os containers | Alinhar todos para o MESMO valor + recriar anon/service keys | Restaurar valor anterior + restart dos serviços |
| S02 | **supabase_meta em crash-loop** (Exited 137) | OOM por limite de memória ou incompatibilidade de imagem | 🟠 P1 — Studio/schema browser fora; pipeline de `types.ts` quebrada | Logs (`tail`) + RestartCount + limite memória vs uso | Aumentar memory limit ou trocar imagem; restart | `docker service update --rollback` ou imagem anterior |
| S03 | **Schema necessário não exposto** no PostgREST | `PGRST_DB_SCHEMAS` sem `zapp`/`storage` | 🔴 P0 — front recebe 404/PGRST106 em toda RPC/tabela | `PGRST_DB_SCHEMAS` (inspect) vs schemas existentes vs uso do front | Adicionar schema à lista + restart do rest (janela curta) | Remover schema + restart |
| S04 | **Edge function stale/missing** vs repo | Deploy manual em outra branch; repo avançou | 🟠 P1 — feature quebrada em prod (404/404 handler) ou comportamento velho | Hash `index.ts` disk(117) × repo(118) → missing/stale/orphan | Redeploy via CLI Supabase ou cópia + restart edge-runtime | Reverter arquivo + restart |
| S05 | **Rota Kong → serviço morto** | Serviço removido/renomeado no compose | 🟠 P1 — 502/503 nas rotas afetadas (auth/rest/storage) | `kong.yml` routes × serviços reais | Corrigir compose/rota + `docker stack deploy` | `docker stack deploy` versão anterior |
| S06 | **Cron falhando silenciosamente** (146 jobs) | Função/RPC alvo renomeada; busca_path quebrado; deadlock | 🟠 P1 — pipelines de dados (partições, backups, sentinels) param sem alarme | `cron.job_run_details` últimos 100 → status/erro | Corrigir SQL/alvo do job afetado | Reverter comando do job |
| S07 | **Backup ausente/stale** | Rotina R2 parou; disco cheio | 🔴 P0 (se ausente) — perda total de dados em desastre | Arquivos de backup (container/volume/R2) + data do último dump | Rodar backup agora + validar leitura | — |
| S08 | **Slot de replicação órfão/inativo** | Realtime parado sem DROP do slot | 🟠 P1 — WAL cresce sem limite → disco 100% → Postgres shutdown forçado | `pg_replication_slots` (active/wal_status) + `pg_ls_waldir()` | DROP do slot órfão (com aprovação) | — |
| S09 | **Drift de migração 3-way** | DDL aplicado via MCP sem arquivo; arquivo sem objeto | 🟡 P2 (documentar) / 🟠 P1 se env fresco quebra | migrations(arquivo) × schema_migrations × objetos | Documentar DB-as-source; alinhar arquivos críticos | — |
| S10 | **auth.users sem zapp.profiles** | Signup sem trigger de profile; user criado via MCP | 🟠 P1 — crash de lookup de profile no front | LEFT JOIN users×profiles nos 2 sentidos | Backfill de profiles (DML transacional, com backup) | DELETE do backfill |
| S11 | **Segredo de feature ausente** (Deno.env.get sem env) | Env novo no código, deploy sem variável | 🟠 P1 — feature específica morta (IA, voz, mapas, Gmail, VT) | Varredura `Deno.env.get` repo × env do functions container | Adicionar secret ao serviço + redeploy da função | Remover env |
| S12 | **Imagem do front stale** vs main | CI não rodou após merge; build manual antigo | 🟠 P1 — usuários em build velho; bundle referencia RPC que mudou | Label `production-<sha>` vs `git rev-parse HEAD` | Rebuild + `docker service update` (janela) | Deploy imagem anterior |
| S13 | **CORS/origem não permitida** | Domínio novo no front sem atualizar GoTrue/Kong | 🟡 P2 — login/upload bloqueado no browser (preflight) | `GOTRUE_URI_ALLOW_LIST` + kong CORS + edge headers | Adicionar origem + restart auth | Remover origem |
| S14 | **Pooler/supavisor incompatível** | Modo session vs transaction errado; porta errada | 🟡 P2 — conexões estouram sob carga | Env do supavisor + logs | Ajustar modo/porta | Restaurar config |
| S15 | **Vault/segredos server-side ausentes** | RPC/edge usa `vault.decrypted_secrets` sem secret | 🟠 P1 — RPC falha em runtime | `vault.secrets` count × uso no código | Criar secret via `vault.create_secret` | Deletar secret |
| S16 | **Realtime: tabela subscrita fora da publicação** | Trigger de publicação falhou; schema errado | 🟠 P1 — UI não atualiza em tempo real (DRIFT silencioso) | `pg_publication_tables` × channels do front | Adicionar tabela à publicação | Remover da publicação |

## 1b. Cenários adicionados pelo Claude Code (validação sênior) — S17–S22

| # | Cenário | Razão de escapar da matriz | Detecção |
|---|---|---|---|
| S17 | **Cache de schema do PostgREST não recarregado após DDL via MCP** — v14 só recarrega em `NOTIFY pgrst, 'reload schema'`, SIGUSR1 ou boot; RPC criada na correção retorna PGRST202/204 | Matriz trata PostgREST só como env, não como cache com ciclo de vida | `pg_stat_activity` + objeto em pg_catalog × `OPTIONS /rest/v1/` |
| S18 | **Corrigir S03 ampliando `PGRST_DB_SCHEMAS` expõe o schema inteiro** — `Accept-Profile` permite alcançar evo/bpm/financeiro/archive com anon/authenticated; tabela nova via MCP herda GRANT default sem RLS → vazamento cross-tenant (a mitigação vira o vetor) | Multi-tenant não aparece na matriz | `has_table_privilege('anon',…)` × `relrowsecurity` por schema exposto |
| S19 | **Views sem `security_invoker=on`** — view roda como owner e bypassa RLS; `CREATE OR REPLACE VIEW` numa correção perde a flag silenciosamente | Drift silencioso: nenhum erro, só dados de outro tenant | `pg_class.reloptions @> '{security_invoker=on}'` em todas as views |
| S20 | **Edge function quebra só no 1º request** — erro de import/boot vira 503 daquela função; isolate quente serve código antigo até reciclar; `functions_ping` em 1 função não valida as 117 | Matriz assume "redeploy não derruba serviço" | Boot smoke-test por função tocada + logs do edge-runtime pós-deploy |
| S21 | **146 cron jobs disparando durante a janela de DDL** — `ALTER TABLE` espera AccessExclusive atrás de job longo e bloqueia leituras → cascata de timeouts; jobs rodam contra objeto meio-migrado | Matriz vê cron como vítima (S06), não como agente de risco | `pg_locks` + `cron.job` ativos na janela |
| S22 | **A correção reintroduz o drift que ela mede** — DDL via MCP sem migration file + `types.ts` não regenerável com meta down = front tipado contra schema velho e auditoria não reproduzível | Auto-poluição da fonte de verdade | Diff `information_schema` × `supabase/migrations/` pós-correção |

## 1c. Checklist de salvaguardas de execução (Claude Code)

**Antes**
- [ ] `pg_dump -Fc` do schema alvo + verificar legibilidade (`pg_restore -l`) — não confiar no backup de rotina
- [ ] Snapshot de baseline: `PGRST_DB_SCHEMAS`, hashes das funções, `pg_publication_tables`, `cron.job`
- [ ] `cron.unschedule` (ou active=false) dos jobs que tocam o objeto; anotar para rearmar
- [ ] Sessão com `SET lock_timeout='3s'; SET statement_timeout='30s'` — DDL falha rápido em vez de bloquear a fila

**Durante — um item por vez, nunca lote**
- [ ] Ordem de restart: `auth` → `rest` → `storage`/`realtime` → `functions` → `kong` por último (revalida upstreams) → front; health-check entre cada; `db` só em último caso
- [ ] Após qualquer DDL: `NOTIFY pgrst, 'reload schema'` antes de declarar sucesso
- [ ] Toda view recriada com `WITH (security_invoker=on)` explícito; toda tabela nova com `ENABLE ROW LEVEL SECURITY` + policy no mesmo bloco

**Depois**
- [ ] Verificação positiva E negativa: rota funciona com JWT do tenant A e retorna vazio para tenant B
- [ ] Boot smoke-test das funções tocadas (2 requests: cold + warm)
- [ ] Rearmar cron e conferir 1 `job_run_details` com `status='succeeded'`
- [ ] Gerar migration file do DDL aplicado, no mesmo dia

**Rollback** — critério de abortar definido ANTES de tocar: se health-check falhar em 2 tentativas, reverter aquele item e parar a janela inteira (não seguir para o próximo P0).

## 2. Gaps previstos no PROCESSO de auditoria (e contramedidas)

| Gap | Contramedida |
|---|---|
| Workers escrevendo no MESMO arquivo → corrupção | 1 arquivo de saída exclusivo por worker (01…10) |
| Worker inventando evidência (alucinação) | Regra anti-alucinação: toda linha com inspect/SQL/log citado; W10 revalida P0s de forma independente |
| Vazamento de segredo em claro | Fingerprint obrigatório; proibido imprimir valores |
| Container distroless (postgrest/kong) sem exec | Env via inspect `Config.Env` |
| `supabase_meta` down → meta list falha | Fallback: `pg_catalog` via `supabase_db_query` |
| Rate limit / timeout de MCP | Retry com backoff; batch de queries; evidência mínima suficiente |
| Overlap de arquivos entre workers | Mapa de arquivos exclusivo por worker (não há sobreposição) |
| Repo local atrás do prod | `git pull` feito antes do snapshot (HEAD a1d01703) |
| Worker rodando git/destrutivo | Proibição explícita nos briefs; somente escrita do arquivo designado |
| `types.ts` stale por causa do meta down | Amostragem por colunas-chave via `pg_catalog` (não depender do meta) |

## 3. Riscos da FASE DE CORREÇÃO (pós-auditoria) — ordem P0→P1→P2

1. **Restart de auth/rest** = janela de ~10-30s de login indisponível → sequenciar fora de pico, health-check após cada restart.
2. **DDL/DML em produção** = sempre em transação, `pg_dump` antes (via exec no supabase_db), rollback documentado por item, respeitar "NÃO MEXA" do AGENTS.md (partições, PK/UNIQUE, schemas de plataforma, PII/LGPD).
3. **Redeploy de edge functions** = não derruba serviço (edge-runtime recarrega), mas validar com `functions_ping` após deploy.
4. **Troca de JWT secret** = derruba TODOS os tokens → só se P0 confirmado, com recriação de anon/service keys e aviso.
5. **Rebuild do front** = CI + teste no staging antes do `service update`; rollback = imagem anterior disponível.

## 4. Critérios P0 (dupla confirmação pelo W10)

- JWT secret idêntico em auth/rest/storage/functions/realtime
- `PGRST_DB_SCHEMAS` contém todos os schemas que o front usa
- Containers essenciais UP: db, rest, auth, kong, functions, storage, realtime
- Backup recente e legível
- `SUPABASE_URL`/DB URL do edge apontam para o backend correto
- Nenhum segredo crítico ausente no functions (feature-core: webhook Evolution, OpenAI/IA)
- Nenhum segredo em claro no repo/bundle
