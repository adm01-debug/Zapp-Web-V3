-- Migration: corrigir guard de idempotencia do webhook (event_id UNIQUE)
-- 2026-07-04
--
-- BUG: markEventProcessed() (evolution-helpers.ts) insere apenas event_id e conta
-- com a violacao de constraint 23505 para detectar duplicatas. Porem a unica UNIQUE
-- da tabela estava em idempotency_key, que o codigo NUNCA preenche (100% NULL).
-- Como NULL nao viola UNIQUE no Postgres, o guard nunca disparava: cada retry do
-- Evolution gravava uma linha nova. Resultado medido: 52.916 linhas / 42.198 event_id
-- unicos = 10.718 duplicatas (20%). Eventos como contacts.update chegaram a 5.211 copias.
--
-- Impacto: retries do Evolution (frequentes em reconexao) processavam mensagens/contatos
-- multiplas vezes -> risco de duplicacao no pipeline downstream e automacoes repetidas.
--
-- FIX: deduplicar o historico (mantem a linha mais antiga por event_id) e criar a UNIQUE
-- na coluna que o codigo realmente usa (event_id). Nenhuma mudanca de codigo necessaria:
-- markEventProcessed ja trata o 23505 corretamente. Validado: 50 eventos identicos
-- concorrentes -> 1 processado + 49 duplicate.

-- 1. Deduplicar historico (idempotente: so remove se houver duplicatas)
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY event_id ORDER BY processed_at NULLS LAST, id) AS rn
  FROM zapp.webhook_events_processed
  WHERE event_id IS NOT NULL
)
DELETE FROM zapp.webhook_events_processed w
USING ranked r
WHERE w.id = r.id AND r.rn > 1;

-- 2. Criar a UNIQUE em event_id (se ainda nao existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'zapp.webhook_events_processed'::regclass
      AND conname = 'webhook_events_processed_event_id_uq'
  ) THEN
    ALTER TABLE zapp.webhook_events_processed
      ADD CONSTRAINT webhook_events_processed_event_id_uq UNIQUE (event_id);
  END IF;
END $$;
