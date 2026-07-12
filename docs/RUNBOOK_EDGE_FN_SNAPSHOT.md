# RUNBOOK — Edge Function Hash Snapshot

> **Atualizado em:** 2026-07-05  
> **Frequência recomendada:** Semanal (toda segunda), ou após qualquer deploy de edge function  
> **Alerta automático:** `ops.fn_edge_fn_staleness_check()` — cron toda segunda 09:00 BRT

---

## Por que isso importa?

O `ops.edge_function_registry` rastreia:
- Quais edge functions estão deployadas no VPS
- Hash SHA256 de cada função (detecção de drift entre VPS e repo)
- Tamanho em bytes (benchmark de crescimento)

Se o registry ficar desatualizado, o check **MI-05** e o teste **RT16** falham.

---

## Quando rodar

| Evento | Ação |
|---|---|
| Deploy de nova edge function | Rodar snapshot completo |
| Remoção de edge function | Rodar snapshot completo |
| Alerta `edge_fn_registry_stale` no sistema | Rodar snapshot completo |
| Toda segunda-feira (cron automático) | Rodar staleness check (automático) |
| Discrepância entre VPS e GitHub | Rodar snapshot + comparar hashes |

---

## Passo a Passo

### 1. Obter lista de funções do container

Via Portainer (ou SSH no host Docker):

```bash
# Portainer → Containers → supabase_functions.1.kv40gvw7juizldwc2z6lgxo2a
# Exec → Bash command:

ls -1 /home/deno/functions | grep -v '^_' | sort
```

### 2. Obter hashes SHA256

```bash
# No mesmo container:
cd /home/deno/functions && \
for d in $(ls -d */ 2>/dev/null | grep -v '^_' | sed 's|/||'); do
  f="$d/index.ts"
  if [ -f "$f" ]; then
    hash=$(sha256sum "$f" 2>/dev/null | cut -d' ' -f1)
    size=$(wc -c < "$f" 2>/dev/null || echo 0)
    echo "$d|$hash|$size"
  fi
done
```

### 3. Atualizar o registry no banco

```sql
-- Passo 3a: Registrar lista de funções
SELECT * FROM ops.fn_edge_function_snapshot(
  ARRAY['ai-auto-tag', 'ai-churn-analysis', ...],  -- lista completa do ls
  NULL  -- repo_sha (opcional: git rev-parse HEAD do repo)
);

-- Passo 3b: Atualizar hashes (via UPDATE com CTE VALUES)
WITH hashes(n,h,s) AS (
  VALUES
    ('nome-da-funcao', 'sha256hash...', tamanho_bytes),
    ...
)
UPDATE ops.edge_function_registry efr
SET fn_hash_sha256 = hashes.h,
    fn_size_bytes  = hashes.s::bigint,
    metadata       = efr.metadata || jsonb_build_object('hash_updated_at', now())
FROM hashes
WHERE efr.fn_name = hashes.n AND efr.deploy_source = 'vps';
```

### 4. Verificar resultado

```sql
-- Status geral
SELECT ops.fn_edge_fn_staleness_check();

-- Distribuição por tamanho
SELECT fn_name, fn_size_bytes, fn_hash_sha256 IS NOT NULL AS has_hash
FROM ops.edge_function_registry
WHERE is_active
ORDER BY fn_size_bytes DESC NULLS LAST
LIMIT 20;

-- Funções sem hash (devem ser apenas test-only)
SELECT fn_name, metadata->>'note' AS note
FROM ops.edge_function_registry
WHERE is_active AND fn_hash_sha256 IS NULL;
```

### 5. Validar via regression tests

```sql
SELECT test_name, status, detail
FROM ops.fn_regression_tests()
WHERE test_name IN ('RT16_edge_fn_registry_100plus', 'RT17_mirror_integrity_no_critical');
-- Ambos devem ser PASS
```

---

## Alerta Automático

O pg_cron job `weekly-edge-fn-freshness` (jobid 123) roda toda segunda às 09:00 BRT e chama `ops.fn_edge_fn_staleness_check()`.

Se o registry estiver desatualizado há mais de **7 dias**, um alerta é criado em `zapp.webhook_health_alerts` com `alert_type='edge_fn_registry_stale'`.

---

## IDs do Ambiente

| Recurso | ID |
|---|---|
| Container edge functions | `supabase_functions.1.kv40gvw7juizldwc2z6lgxo2a` |
| pg_cron job | `jobid=123` (`weekly-edge-fn-freshness`) |
| Tabela registry | `ops.edge_function_registry` |
| Função snapshot | `ops.fn_edge_function_snapshot(text[], text)` |
| Função staleness | `ops.fn_edge_fn_staleness_check()` |

---

*Runbook gerado pela auditoria de espelhamento Cloud→zapp (2026-07-05 — MELHORIA 9).*
