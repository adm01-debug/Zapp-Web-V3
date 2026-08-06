-- Item 58 da auditoria infra (AG-EX-01): pgmq sem uso
-- Verificacao previa: pg_depend sem dependencias externas (so membros internos da extensao),
-- 0 filas em pgmq.list_queues(), nenhuma referencia no repo (grep pgmq).
DROP EXTENSION IF EXISTS pgmq;
