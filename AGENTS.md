# AGENTS.md — Regras de Engajamento (devs humanos e agentes LLM)

> Objetivo: mexer **só onde pode**, sem quebrar a arquitetura planejada do banco.
>
> **Leitura obrigatória antes de mexer no banco:**
> - [`CLAUDE.md`](./CLAUDE.md) — contexto profundo: regras PostgREST (`schema: 'zapp'`), Realtime, histórico de bugs.
> - [`docs/db/ARCHITECTURE.md`](./docs/db/ARCHITECTURE.md) e [`docs/db/SCHEMA-CONTRACT.md`](./docs/db/SCHEMA-CONTRACT.md) — mapa e contrato de schemas.

## Onde mora o quê

> **Pós-desacoplamento (2026-08-12):** Infra da Evolution (servidor, stacks, consumer) está em [adm01-debug/evolution-stack](https://github.com/adm01-debug/evolution-stack). Edge functions `evolution-*` e schema `evo` permanecem **aqui**.
- Dado real do **WhatsApp/Evolution** → schema **`evo`** (`evolution_*`, partições, `contact_id_graveyard`).
- Dado real do **app ZAPP Web** → schema **`zapp`**.
- **`public` é só camada de API** (views `security_invoker` + RPC). **Nunca** crie tabela nem escreva "na tabela" do `public` — ali é sempre uma **view** apontando para `zapp`/`evo`/domínio.
- Módulos de negócio isolados: `bpm`, `vendas`, `financeiro`, `email_app`, `ai`, `logistica`, `artes`.
- Infra/observabilidade em `ops`/`monitoring`. Frio/backup em `archive`.

## Direção de dependência

- **Permitido:** `public → domínios`; `zapp → evo` **apenas via contrato curado**.
- **Proibido:** `evo` depender de `zapp` (a Evolution nunca importa o app).

## Fluxo obrigatório para mudança de banco

> 📖 **Guia canônico de migrations:** [`supabase/migrations/README.md`](./supabase/migrations/README.md) — leia ANTES de criar migration: DB-as-source, baseline `20260817000000`, aplicador `apply-migrations.sh`, gates de CI, buckets B0–B8 e template.

1. Ler `CLAUDE.md` + `docs/db/SCHEMA-CONTRACT.md` e confirmar o **schema-dono** do objeto.
2. Escrever **migration versionada** (nome `^\d{14}$` — 14 dígitos `YYYYMMDDHHMMSS`).
3. Escrever o **teste** que falha sem a mudança.
4. Rodar em **staging**; comparar contra o baseline. Só então promover para produção.
5. **Nunca** rodar DDL manual em produção. Nunca commitar direto na `main` (abrir PR).

### Modelo vigente: DB-as-source (produção self-hosted)

O banco de produção é a **fonte de verdade dos objetos**. O fluxo oficial de mudança de banco é:

1. DDL em produção é aplicado via **MCP SQL versionado** (`supabase_apply_migration` / `supabase_db_query` + psql via Portainer quando a role do MCP não cobre o DDL), **nunca** DDL solto sem versionamento.
2. Toda aplicação grava o registro em `supabase_migrations.schema_migrations` (`version` + `name`) — idempotente (`ON CONFLICT (version) DO NOTHING`).
3. As migrations no repo (`supabase/migrations/*.sql`) são o **registro histórico** (espelho do que roda no DB), não o mecanismo de aplicação — `supabase db push` **não** é usado neste DB (restaurado de dump). Reorganizações do diretório de migrations NÃO desaplicam o que já está no DB.
4. Timestamps futuros (ex.: `20260806125000`) são **permitidos e normais** para ordenação — o padrão da casa é `YYYYMMDDHHMMSS`, sem restrição de "não pode ser depois de hoje".
5. Se o objeto já existir no DB (drift DB×repo), a migration versionada deve conter o corpo **corrigido que já roda no DB** (alinhar repo×DB, sem reintroduzir bug) e é aplicada como no-op + registrada.
6. Arquivo de migration sem efeito real no DB **não** é registrado antes de decisão explícita (aplicar × arquivar).

## Lista "NÃO MEXA" (sem revisão sênior explícita)

- **Partições-filhas** de `evo.evolution_messages` / `evolution_conversations` / `evolution_webhook_events` — criadas por cron (`evo.fn_auto_create_next_partitions`).
- **`evo.fn_ensure_evolution_backcompat_views` e as views de compat** — alterar a allowlist/função, nunca a view avulsa. Ver [`docs/db/BACKCOMPAT-VIEWS.md`](./docs/db/BACKCOMPAT-VIEWS.md).
- **Crons de DR/backup:** `daily-backup-sentinel-check`, `restore-integrity-check`, `fn_auto_update_backup_sentinel`.
- **Tabelas com PII:** `zapp._lgpd_payload` (e qualquer tabela de payload/anonimização LGPD).
- **Schemas de plataforma:** `auth`, `storage`, `realtime`, `_realtime`, `vault`, `pgsodium`, `net`, `graphql`, `cron`, `pgmq`, `supabase_*`.
- **PK / UNIQUE / índice de suporte de FK** — **nunca** dropar em "limpeza de índice", mesmo que apareça com `idx_scan=0`. Ver [`docs/db/INDEXES.md`](./docs/db/INDEXES.md).

## Convenções

- Funções: `fn_*` (interna), `rpc_*` (exposta via PostgREST), `trg_*` (trigger), `get_*` (leitura). A maioria é `SECURITY DEFINER` — **sempre** fixe `search_path` em função `SECURITY DEFINER`.
- Comando de cron: **sempre** qualifique com `schema.função` (ex.: `SELECT zapp.fn_x()`), nunca dependa do `search_path`.
- Migration: um tema por migration; rollback documentado.

## VPS PRODUÇÃO — mudanças proibidas sem aval do dono (incidente 15/08/2026)

- **NUNCA** rodar upgrade de SO (`do-release-upgrade`), `reboot`/`shutdown`, `apt upgrade`/`dist-upgrade`, troca de kernel ou alterar pacotes do HOST da VPS sem aprovacao EXPLICITA do Joaquim. Incidente 15/08: agente fez upgrade Ubuntu 20.04→24.04, ativou autolock do Swarm e rebootou 2x — 145 servicos fora do ar ~30min.
- **NUNCA** ativar/alterar autolock do Swarm (`docker swarm update --autolock=true`). Autolock DESATIVADO por decisao do dono (15/08) — manter OFF para sempre.
- SSH emergencial na VPS (porta 6543): SOMENTE leitura/diagnostico; escrita so com aval.
- Docker 29.x exige cliente API >= 1.44 — imagens antigas (ex.: traefik v2.11.2) ficam cegas; conferir compatibilidade da imagem antes de deployar stack.
- Se o Swarm estiver travado ("Swarm is encrypted"): chave swarm-unlock guardada em local protegido (fora do repo); destravar e manter autolock OFF.
- **ANTES de commitar docs**: `git grep -E '209\.142\.67\.51|186\.207\.138\.55' origin/main` deve dar 0 em docs vivos — IPs reais do dono/VPS usam placeholders `<IP-VPS>`/`<IP-ESCRITORIO>` (sanitização rodada 8, 2026-08-17).
- **NUNCA** usar `docker service update --rollback` sem `--image` explícito após um rollback automático: o `PreviousSpec` do Swarm aponta para a spec QUE FALHOU — o comando cego reaplica a versão quebrada (incidente realtime 128.3, 17/08).
