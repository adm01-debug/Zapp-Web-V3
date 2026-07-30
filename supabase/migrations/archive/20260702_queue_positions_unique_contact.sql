-- Migration: unicidade de queue_positions (anti double-booking)
-- Data: 2026-07-02
-- Contexto: zapp.queue_positions tinha APENAS PK em id — nenhuma constraint impedia
--   (a) o mesmo contato enfileirado várias vezes na mesma fila (double-booking), nem
--   (b) contadores de "aguardando" inflados por retries/double-click no enfileiramento.
--
-- Já APLICADO em produção (self-hosted) em 2026-07-02 após:
--   * radiografia de constraints/triggers/índices (só PK em id),
--   * confirmação de que o frontend só LÊ queue_positions (nenhum caminho de escrita
--     no app quebra com a constraint — o produtor é externo/server-side),
--   * bateria de 302 cenários simulados em transação revertida (100/100 inserts
--     legítimos ok, double-booking bloqueado, mesmo contato em filas diferentes
--     permitido, 200/200 double-clicks barrados, 0 vazamentos),
--   * verificação de 0 duplicatas latentes imediatamente antes do CREATE.
--
-- Esta migration é idempotente (IF NOT EXISTS) e serve para reproduzir o estado
-- em staging/ambientes novos.
--
-- NOTA DE DESIGN: deliberadamente NÃO foi criada UNIQUE(queue_id, position).
--   Posições empatadas são um problema apenas cosmético (ordenação não-determinística)
--   e o produtor de escrita (server-side) atribui `position`; uma constraint em
--   (queue_id, position) poderia derrubar inserts sob concorrência (corrida em
--   MAX(position)+1) sem que este repo controle o retry desse produtor. A correção
--   correta para empate de posição é o produtor usar sequência/ordenação estável,
--   não uma constraint que rejeita inserts.

CREATE UNIQUE INDEX IF NOT EXISTS uq_queue_positions_queue_contact
  ON zapp.queue_positions (queue_id, contact_id);

COMMENT ON INDEX zapp.uq_queue_positions_queue_contact IS
  'Impede double-booking: um contato no máximo 1x por fila. Contato pode estar em filas diferentes (constraint é por par queue+contact).';
