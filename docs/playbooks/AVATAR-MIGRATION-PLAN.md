# AVATAR-MIGRATION-PLAN — Lovable Cloud → Self-Hosted (AtomicaBR)

> **GAP-V05** · Status: **PLANEJADO — NÃO EXECUTADO** · Data: 2026-08-03
> Alvo: `docs/playbooks/AVATAR-MIGRATION-PLAN.md` · Relacionados: [`supabase/migrations/20260803170100_storage_migration_plan.sql`](../../supabase/migrations/20260803170100_storage_migration_plan.sql), [`docs/simulation/2026-08-03_storage_migration_500_simulation.json`](../simulation/2026-08-03_storage_migration_500_simulation.json)
> ⚠️ **Este documento é um PLANO. Nada aqui deve ser executado sem aprovação explícita.**

---

## 1. Contexto e Objetivo

- **1066 contatos** (`evo.evolution_contacts.profile_picture_url`) apontam para avatares no storage do **Supabase Lovable Cloud** (`allrjhkpuscmgbsnmjlv.supabase.co`).
- `zapp.contacts` é uma **VIEW** — `avatar_url` é apenas `ec.profile_picture_url`. **Toda escrita deve ir para `evo.evolution_contacts`.**
- O storage self-hosted (`supabase.atomicabr.com.br`, bucket `avatars`) tem **1380 objetos** — mas **NENHUM corresponde** aos 1066 arquivos antigos (nomes diferentes).
- O projeto Lovable pode ser desligado a qualquer momento → o band-aid CSP (`img-src` com o domínio antigo em `nginx.conf` + `vercel.json`) é a única coisa que mantém os avatares carregando.
- **Objetivo:** copiar os 1066 avatares do Lovable para o self-hosted, reescrever as URLs no banco, validar e **remover o band-aid CSP**.

---

## 2. Verificação — Estado Atual (validado via MCP Supabase em 2026-08-03)

### 2.1 Fontes de dados

| Query (SELECT) | Resultado |
|---|---|
| `SELECT count(*) FROM zapp.contacts WHERE avatar_url LIKE '%allrjhkpuscmgbsnmjlv%'` | **1066** |
| `SELECT count(*) FROM evo.evolution_contacts WHERE profile_picture_url LIKE '%allrjhkpuscmgbsnmjlv%'` | **1066** (mesmos contatos, via VIEW) |
| `SELECT count(*) FROM zapp._backup_avatar_urls_20260803` | **1066** (backup pré-existente — OK) |
| `SELECT count(*) FROM storage.objects WHERE bucket_id='avatars'` | **1380** objetos (~58 MB, todos com prefixo `avatars/`) |
| `SELECT count(*) FROM evo.evolution_contacts WHERE profile_picture_url LIKE '%supabase.atomicabr.com.br%'` | **647** (já migrados / novos) |
| `SELECT count(*) FROM evo.evolution_contacts WHERE profile_picture_url IS NULL OR ''` | **18721** (sem avatar) |
| `SELECT count(*) FROM evo.evolution_messages WHERE media_url LIKE '%allrjhkpuscmgbsnmjlv%'` | **0** (sem refs em mensagens) |

### 2.2 Correspondência bucket ↔ URLs antigas (pergunta-chave)

```sql
-- Quantos arquivos antigos JÁ existem no self-hosted? → 0
WITH old AS (
  SELECT DISTINCT substring(regexp_replace(profile_picture_url, '\?.*$', ''), '[^/]+$') AS fname
  FROM evo.evolution_contacts WHERE profile_picture_url LIKE '%allrjhkpuscmgbsnmjlv%'
)
SELECT count(*) AS old_distinct_files,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM storage.objects o
                       WHERE o.bucket_id='avatars' AND o.name = old.fname)) AS matched_in_selfhosted
FROM old;
-- RESULTADO: old_distinct_files=1066, matched_in_selfhosted=**0**

-- Reverso: quantos objetos do self-hosted são referenciados por URLs antigas? → 0
SELECT count(*) AS storage_objects,
       count(*) FILTER (WHERE name IN (SELECT DISTINCT substring(regexp_replace(profile_picture_url, '\?.*$', ''), '[^/]+$')
                       FROM evo.evolution_contacts WHERE profile_picture_url LIKE '%allrjhkpuscmgbsnmjlv%')) AS matched_old
FROM storage.objects WHERE bucket_id='avatars';
-- RESULTADO: storage_objects=1380, matched_old=**0**
```

**Conclusão:** os 1380 objetos do self-hosted são avatares **novos** (sincronizados do Evolution após o cutover — timestamps `1783xxx`/`1785xxx` vs `1773xxx` dos antigos). **Os 1066 avatares antigos existem APENAS no Lovable Cloud** e precisam ser baixados de lá.

### 2.3 Formato das URLs antigas (100% uniforme)

```
https://allrjhkpuscmgbsnmjlv.supabase.co/storage/v1/object/public/avatars/avatars/<telefone>_<timestamp>.jpg
```

- 1066 paths distintos · **0** query strings · **100% `.jpg`** · todas `object/public` (sem signed URLs).
- **Teste de vida da fonte (curl HEAD):** `https://allrjhkpuscmgbsnmjlv.supabase.co/storage/v1/object/public/avatars/avatars/5519991845606_1773877416931.jpg` → **HTTP 200** ✔ (Lovable Cloud ainda online — janela de migração ABERTA).
- Bucket `avatars` no self-hosted: `public=true`, `file_size_limit=5242880` (5 MB), mime permitidos: jpeg/png/webp/gif → **novas URLs públicas não precisam de signed URL**.

### 2.4 Triggers em `evo.evolution_contacts` (34; 16 disparam em UPDATE)

| Trigger (UPDATE) | Efeito na migração |
|---|---|
| `fn_rewrite_contact_url` | **Inócuo** — só reescreve `kong:`/`minio`, não toca `supabase.co` |
| `fn_block_internal_media_url` | **Inócuo** — só bloqueia localhost/loopback |
| `trg_queue_contact_for_bitrix` | **Stub** (`RETURN NEW`) — sem efeito |
| `fn_auto_update_lead_score` | **Respeita `app.batch_mode=on`** → usar `SET LOCAL app.batch_mode='on'` no lote |
| `sync_contact_intelligence` | Skip se lead_score/purchases/status/messages/deleted_at não mudaram → **OK** |
| `auto_add_deleted_contact_to_graveyard` | Só se `deleted_at` transicionar NULL→valor → **OK** |
| `auto_assign_to_queue_agent_sh`, `fn_log_assignment_change` | Só se `queue_id`/`assigned_to` mudarem → **OK** |
| `increment_snapshot_version`, `trigger_snapshot_on_contacts_update` | Contadores — custo trivial |
| `trg_update_search_vector`, `trg_evolution_contacts_updated_at`, `update_contacts_updated_at`, `trg_extract_phone`, `trg_normalize_contact_phone`, `trg_sync_full_name` | Custo de escrita — **mitigar com lotes de 100 + sleep** |

---

## 3. Script SQL — Mapeamento `avatar_url` → storage object path

> Executar em **fase 3 (após upload)** ou como dry-run (SELECT) antes. A tabela `zapp._avatar_migration_map` é o artefato central: lista o que migrar, a URL nova e o path do objeto.

```sql
-- ============================================================================
-- 3.1 MAPA DE MIGRAÇÃO (dry-run = SELECT; aplicar = CREATE TABLE)
-- Gera, para cada contato com URL antiga, o object path no bucket e a URL nova.
-- A URL nova = mesmo path, host novo (bucket é público → URL direta).
-- ============================================================================
CREATE TABLE IF NOT EXISTS zapp._avatar_migration_map AS
SELECT
  ec.id,
  ec.remote_jid,
  ec.instance_name,
  ec.profile_picture_url AS old_url,
  'https://supabase.atomicabr.com.br' || substring(ec.profile_picture_url
      FROM '/storage/v1/object/public/avatars/[^?]+')            AS new_url,
  substring(ec.profile_picture_url
      FROM '/storage/v1/object/public/avatars/([^?]+)')           AS object_path
FROM evo.evolution_contacts ec
WHERE ec.profile_picture_url LIKE '%allrjhkpuscmgbsnmjlv%'
  AND ec.deleted_at IS NULL;

-- Validar o mapa: 1066 linhas, object_path sempre 'avatars/<arquivo>.jpg'
SELECT count(*) AS mapped,
       count(*) FILTER (WHERE object_path IS NULL) AS null_paths,
       count(DISTINCT object_path) AS distinct_paths
FROM zapp._avatar_migration_map;

-- ============================================================================
-- 3.2 UPDATE EM LOTES (fase 4 — APENAS DEPOIS do upload físico!)
-- 1066 linhas ÷ 100 = 11 lotes. Sleep de 2s entre lotes. app.batch_mode evita
-- trabalho de lead_score (trigger respeita o GUC).
-- ============================================================================
DO $$
DECLARE
  v_batch  int  := 100;
  v_off    int  := 0;
  v_rows   int  := 1;
  v_total  int  := 0;
BEGIN
  PERFORM set_config('app.batch_mode', 'on', true);   -- session-level
  WHILE v_rows > 0 LOOP
    WITH batch AS (
      SELECT id FROM zapp._avatar_migration_map
      ORDER BY id LIMIT v_batch OFFSET v_off
    )
    UPDATE evo.evolution_contacts ec
    SET profile_picture_url = replace(ec.profile_picture_url,
        'https://allrjhkpuscmgbsnmjlv.supabase.co',
        'https://supabase.atomicabr.com.br')
    FROM batch b
    WHERE ec.id = b.id
      AND ec.profile_picture_url LIKE '%allrjhkpuscmgbsnmjlv%';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_total := v_total + v_rows;
    v_off   := v_off + v_batch;
    RAISE NOTICE 'lote aplicado: % linhas (total %)', v_rows, v_total;
    PERFORM pg_sleep(2);
  END LOOP;
  RAISE NOTICE 'MIGRAÇÃO DB CONCLUÍDA: % linhas atualizadas', v_total;
END $$;

-- ============================================================================
-- 3.3 VERIFICAÇÃO PÓS-UPDATE (deve retornar 0 / 1066 / 1066)
-- ============================================================================
SELECT
  count(*) FILTER (WHERE profile_picture_url LIKE '%allrjhkpuscmgbsnmjlv%')       AS old_remaining,
  count(*) FILTER (WHERE profile_picture_url LIKE '%supabase.atomicabr.com.br%') AS new_migrated
FROM evo.evolution_contacts;
-- Esperado: old_remaining=0, new_migrated ≥ 1066 (havia 647 anteriores)

-- Conferência 1:1 contra o mapa (nenhuma URL antiga deve sobrar no DB)
SELECT count(*) AS orphaned
FROM zapp._avatar_migration_map m
LEFT JOIN evo.evolution_contacts ec ON ec.id = m.id
WHERE ec.profile_picture_url LIKE '%allrjhkpuscmgbsnmjlv%';
-- Esperado: 0

-- ============================================================================
-- 3.4 MONITORAMENTO CONTÍNUO (enquanto o band-aid CSP estiver ativo)
-- ============================================================================
SELECT count(*) AS contacts_at_risk
FROM evo.evolution_contacts
WHERE profile_picture_url LIKE '%allrjhkpuscmgbsnmjlv%';
-- > 0 após a migração = rollback ou investigar
```

---

## 4. Estratégia de Migração — Execução

### Fase 0 — Pre-flight (10 min)
1. Reexecutar as queries da seção 2 (estado pode ter mudado).
2. Confirmar `curl -sI` → **200** numa amostra de 5 URLs antigas.
3. Confirmar existência do backup: `SELECT count(*) FROM zapp._backup_avatar_urls_20260803;` → 1066. Se ausente/desatualizado, recriar:
   ```sql
   DROP TABLE IF EXISTS zapp._backup_avatar_urls_20260803;
   CREATE TABLE zapp._backup_avatar_urls_20260803 AS
   SELECT id, remote_jid, instance_name, profile_picture_url, updated_at
   FROM evo.evolution_contacts WHERE profile_picture_url LIKE '%allrjhkpuscmgbsnmjlv%';
   ```
4. Obter **service_role key** do self-hosted (VPS: `.env` do stack / segredo do Portainer) — a anon key pode não ter permissão de upload no bucket. **Nunca commitar a chave.**
5. Verificar espaço em disco da VPS (58 MB estimados de upload — folga ampla).

### Fase 1 — Export do Lovable (10–15 min)
Script Python (rodar na VPS ou na máquina de execução, `python3`):

```python
# export_avatars.py — baixa os 1066 avatares do Lovable Cloud (resumível)
import csv, os, time, urllib.request, concurrent.futures, sys

OUT_DIR = "avatar_export"
os.makedirs(OUT_DIR, exist_ok=True)

def fetch(row):
    old, obj = row["old_url"], row["object_path"]
    fname = obj.replace("/", "_")
    dst = os.path.join(OUT_DIR, fname)
    if os.path.exists(dst) and os.path.getsize(dst) > 0:
        return dst, "skip"
    for attempt in range(4):                      # retry com backoff
        try:
            req = urllib.request.Request(old, headers={"User-Agent": "avatar-migration"})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
                if not data:
                    raise ValueError("empty body")
                open(dst, "wb").write(data)
                return dst, f"ok:{len(data)}"
        except Exception as e:
            time.sleep(2 ** attempt * 2)          # 2,4,8s
    return dst, f"FAIL:{e}"

with open("avatar_export_manifest.csv", "w", newline="") as mf:
    w = csv.writer(mf)
    w.writerow(["object_path", "old_url", "result"])
    # rows: ler de zapp._avatar_migration_map (SELECT object_path, old_url)
    rows = [...]  # ← popular com o SELECT da fase 0 (ou CSV exportado do MCP)
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:  # 8 → evita 429
        for dst, res in ex.map(fetch, rows):
            w.writerow([dst, res])
            print(res, dst)
```

**Regras do export:** 8 workers no máx., retry 4× com backoff (mitiga rate-limit 429 — cenário S0001 da simulação), grava manifest CSV, resumível (pula arquivos já baixados). **Fail 404** (arquivo deletado no Lovable): registrar e **não** bloquear o lote — decidir placeholder vs. manter URL antiga (ver §6 Riscos).

### Fase 2 — Import no self-hosted (10–20 min)
```python
# import_avatars.py — upload via Storage API (bucket público, service_role key)
# POST https://supabase.atomicabr.com.br/storage/v1/object/avatars/avatars/<file>
# Headers: Authorization: Bearer <SERVICE_ROLE>, Content-Type: image/jpeg
# Mesma lógica do export: 8 workers, retry 4×, manifest de resultado.
```
- **Path do objeto:** `avatars/<arquivo>.jpg` (o prefixo `avatars/` já faz parte do nome — manter igual ao de origem para a URL nova ser idêntica à antiga trocando só o host).
- **Upsert:** `POST` sobrescreve se existir (idempotente) — se durante a janela o Evolution sincronizar um avatar novo com o mesmo nome, o último upload vence.
- **Alternativa B (avançada):** upload direto ao MinIO (rclone/aws cli) + `INSERT INTO storage.objects` manual — só se a Storage API estiver lenta/indisponível. Requer replicar `owner`, `metadata` e `bucket_id` corretamente; preferir a API.
- **Gate de qualidade por arquivo:** `metadata->>'size' > 0` e mime `image/jpeg` (bucket só aceita jpeg/png/webp/gif).
- **Validação final da fase:** para cada arquivo, `curl -sI https://supabase.atomicabr.com.br/storage/v1/object/public/avatars/avatars/<file>` → **200**; conferir `storage.objects` count = 1066 + 1380 = **2446**.

### Fase 3 — Mapa SQL (5 min)
Executar seção 3.1 (`CREATE TABLE zapp._avatar_migration_map ...`) e conferir 1066 linhas com `object_path` 100% preenchido. **Só prosseguir se `matched_in_selfhosted` (nova checagem) = 1066.**

### Fase 4 — UPDATE no banco (5–10 min)
Executar seção 3.2 (lotes de 100, `app.batch_mode=on`, sleep 2s). Depois 3.3 (verificação).

### Fase 5 — Validação funcional (15 min)
1. Amostra de 20 contatos: `SELECT profile_picture_url FROM evo.evolution_contacts ORDER BY random() LIMIT 20` → abrir 5 URLs novas no browser → **imagens carregam** (sem erro de CSP).
2. Console do app (produção): 0 erros de imagem quebrada; `img-src` novo deve aparecer sem o domínio antigo **após** a fase 6.
3. `zapp.contacts` (VIEW) reflete automaticamente — sem ação extra.

### Fase 6 — Remoção do band-aid CSP (15 min, deploy)
1. `nginx.conf`: remover `https://allrjhkpuscmgbsnmjlv.supabase.co` do `img-src` (linha ~20).
2. `vercel.json`: idem (header `Content-Security-Policy`, ~linha 42).
3. Deploy Vercel (imediato) + `nginx -t && systemctl reload nginx` (ou `docker exec <nginx> nginx -s reload`).
4. **Ordem:** primeiro nginx, depois Vercel (ou ambos no mesmo PR/commit) — evitar janela onde Vercel novo + nginx velho divergem (cenário S0019).
5. Validar: `curl -sI https://app.atomicabr.com.br | grep -i content-security-policy` → sem o domínio antigo; avatares carregando no browser.

### Fase 7 — Soak & Cleanup (7 dias depois)
```sql
-- Após 7 dias sem incidentes:
DROP TABLE IF EXISTS zapp._avatar_migration_map;
DROP TABLE IF EXISTS zapp._backup_avatar_urls_20260803;
```
- Registrar no CHANGELOG (cenário S0040 da simulação).
- Opcional: ADR curto documentando a decisão (S0041).

---

## 5. Rollback (a qualquer momento até a fase 6)

**Como reverter se algo quebrar:**

```sql
-- 5.1 Restaurar URLs antigas a partir do backup (1:1 por id)
UPDATE evo.evolution_contacts ec
SET profile_picture_url = bk.profile_picture_url
FROM zapp._backup_avatar_urls_20260803 bk
WHERE ec.id = bk.id;
-- Verificar: count(*)=1066 com domínio antigo; 0 com domínio novo (além dos 647 pré-existentes)

-- 5.2 Arquivos já enviados ao self-hosted: opcional remover
-- DELETE FROM storage.objects WHERE bucket_id='avatars' AND name IN (SELECT object_path FROM zapp._avatar_migration_map);
-- (ou simplesmente deixar — inofensivos; remover só se houver motivo)
```

- **CSP:** se a fase 6 já rodou, fazer `git revert` do PR de remoção do CSP e redeployar (nginx + Vercel). As URLs antigas continuam vivas no Lovable → avatares voltam a carregar normalmente.
- **Fonte de dados preservada:** o Lovable Cloud está online e o backup de URLs existe → rollback é **totalmente viável** enquanto o projeto Lovable não for desligado. Por isso: **migrar agora, não esperar.**
- **Indicador de rollback:** `contacts_at_risk > 0` (seção 3.4) após migração completa, ou avatares quebrados no browser com CSP novo.

---

## 6. Estimativa de Tempo e Risco

### Tempo (janela total: ~1h30 — pode ser feita em horário comercial, baixa concorrência)

| Fase | Duração | Paralelizável |
|---|---|---|
| 0. Pre-flight | 10 min | — |
| 1. Export (1066 × ~45 KB avg) | 10–15 min | 8 workers |
| 2. Import | 10–20 min | 8 workers |
| 3. Mapa SQL | 5 min | — |
| 4. UPDATE (11 lotes) | 5–10 min | serial (obrigatório) |
| 5. Validação | 15 min | — |
| 6. CSP cleanup + deploy | 15 min | — |
| **Total** | **~1h15–1h30** | — |

### Riscos e Mitigações

| # | Risco | Sev. | Mitigação |
|---|---|---|---|
| R1 | Lovable Cloud desligado antes/durante a migração (fonte some) | **CRÍTICO** | Executar assim que aprovado; export é a 1ª coisa; se cair no meio, rollback via backup + CSP band-aid (que continua no ar até a fase 6) |
| R2 | Rate-limit 429 no download em massa | ALTO | 8 workers máx., retry 4× com backoff (S0001) |
| R3 | 404 em alguns arquivos (deletados no Lovable) | MÉDIO | Registrar no manifest; decidir: manter URL antiga (CSP band-aid continua só p/ esses) ou placeholder — **decisão de negócio antes de executar** (S0007) |
| R4 | UPDATE em massa com 16 triggers por linha | MÉDIO | Lotes de 100 + sleep 2s + `app.batch_mode=on`; ~3–5 min de lock total aceitável (S0009/S0014/S0038) |
| R5 | Upload sem permissão (anon key) | MÉDIO | Usar service_role key; testar 1 upload antes do lote |
| R6 | CSP removido antes da migração completar | ALTO | Fase 6 é a ÚLTIMA; gate: 0 URLs antigas + 200 em amostra (S0017) |
| R7 | Novos avatares chegando durante a migração (Evolution sync) | BAIXO | Upload idempotente (POST sobrescreve); UPDATE usa `replace()` e WHERE com domínio antigo → nunca reverte um avatar novo |
| R8 | URL nova aponta para arquivo que não subiu (race) | CRÍTICO | Fase 3 gate: 1066/1066 `matched_in_selfhosted` antes do UPDATE (S0011) |
| R9 | `trg_rewrite_contact_url`/validadores interferirem | BAIXO | Verificado: inócuos para URLs supabase.co (seção 2.4) |
| R10 | Upload corrompido (JPEG truncado) | MÉDIO | Validar `size>0` + content-type por arquivo; spot-check visual (S0003) |

---

## 7. CHECKLIST passo a passo

### Pré-requisitos
- [ ] Aprovação para executar (Joaquim) + janela agendada
- [ ] Service role key do self-hosted disponível (nunca em git)
- [ ] Decisão de negócio para arquivos 404 (placeholder vs. manter antigo)
- [ ] VPS com disco livre (≥1 GB) e python3

### Fase 0 — Pre-flight
- [ ] Reexecutar queries §2.1 (contagens iguais: 1066 / 1380 / 1066 backup)
- [ ] `curl -sI` 200 em 5 URLs antigas amostrais
- [ ] Bucket `avatars` público e com `file_size_limit` ≥ 5 MB (confirmado 2026-08-03)
- [ ] Backup `zapp._backup_avatar_urls_20260803` = 1066 (ou recriar §4-F0.3)

### Fase 1 — Export
- [ ] Rodar `export_avatars.py` → 1066 arquivos em `avatar_export/`
- [ ] Manifest: 0 FAILs; 404s anotados conforme decisão

### Fase 2 — Import
- [ ] Rodar `import_avatars.py` (service role) → 1066 uploads OK
- [ ] `storage.objects` bucket `avatars` = **2446** (1380 + 1066)
- [ ] Amostra de 10 `curl -sI` novas URLs → 200

### Fase 3 — Mapa
- [ ] `CREATE TABLE zapp._avatar_migration_map` → 1066 linhas, 0 null_paths
- [ ] Checagem `matched_in_selfhosted` = **1066** (gate R8)

### Fase 4 — UPDATE
- [ ] Executar DO $$ §3.2 → NOTICE final "1066 linhas atualizadas"
- [ ] §3.3: `old_remaining=0`, `new_migrated≥1066`, `orphaned=0`

### Fase 5 — Validação funcional
- [ ] 5 URLs novas abrem no browser sem erro CSP
- [ ] Console produção: 0 broken images / 0 erros de avatar
- [ ] App sem cache (hard refresh) mostra avatares

### Fase 6 — CSP cleanup
- [ ] `nginx.conf` sem o domínio antigo no `img-src`
- [ ] `vercel.json` sem o domínio antigo no `img-src`
- [ ] `nginx -t` OK + reload; deploy Vercel
- [ ] `curl -sI` header CSP confirma remoção; avatares carregam

### Fase 7 — Soak & Cleanup
- [ ] 7 dias sem incidente → `DROP TABLE` backup + mapa
- [ ] CHANGELOG atualizado (+ ADR curto recomendado)

---

## 8. Notas Finais

- **Urgência:** a fonte (Lovable) está online agora (HTTP 200). A migração elimina a dependência de um projeto de terceiros que pode ser desligado sem aviso — o CSP band-aid é frágil por design.
- **Nada de signed URLs:** bucket público + URLs diretas = swap de host simples no UPDATE.
- **A VIEW `zapp.contacts` não precisa de mudança** — ela lê `profile_picture_url` da tabela base.
- Simulação completa de 41 cenários (500 falhas sintéticas) em `docs/simulation/2026-08-03_storage_migration_500_simulation.json` — consultar antes de executar.
