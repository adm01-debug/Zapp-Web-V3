-- =============================================================================
-- Recria zapp.sicoob_contact_mapping (drift não documentado, achado pela
-- auditoria multi-agente de 2026-08-21 sobre os Blocos 0-5 do
-- PLANO-100-CONTRATOS-EDGE).
--
-- CONTEXTO: a tabela é referenciada por 3 pontos de código —
-- sicoob-bridge/index.ts (SELECT ~L32-37 + INSERT ~L60-63) e
-- sicoob-bridge-reply/index.ts (SELECT ~L74-78) — e por uma policy RLS já
-- presente na migration canônica squash (20260804000000_canonical_schema_
-- squash_133_migrations.sql, linha ~10352-10354: "CREATE POLICY
-- sicoob_mapping_select ON zapp.sicoob_contact_mapping..."), além de estar
-- documentada em docs/DATABASE_TABLES_INVENTORY.md — mas não existe em
-- NENHUM schema do banco de produção (confirmado ao vivo via MCP:
-- information_schema.tables com table_name ILIKE '%sicoob%' retorna 0
-- linhas em todos os 28 schemas, incluindo archive/graveyard). Nenhuma
-- migration rastreada (nem em supabase/migrations/, nem em
-- docs/history/migrations-archive/) tem um DROP TABLE correspondente — é
-- drift não documentado (provável DDL manual fora do controle de
-- migrations), não uma decisão de produto. A migration
-- decouple_i4_sicoob (20260815200008) é sobre outra coisa (troca de URL
-- hardcoded por vault secret no trigger) e não toca esta tabela.
--
-- IMPACTO ATÉ AQUI: com a tabela ausente, todo lookup/insert falhava com
-- "relation does not exist" (PGRST205), e nenhum dos 3 call-sites checava o
-- campo `error` da resposta do client Supabase — a falha era engolida
-- silenciosamente (sicoob-bridge-reply sempre respondia 404 "No Sicoob
-- mapping found for this contact", sem log de erro real). A integração de
-- resposta ao Sicoob Gifts ficou estruturalmente quebrada.
--
-- SCHEMA: reconstruído a partir de docs/DATABASE_TABLES_INVENTORY.md (única
-- fonte remanescente do schema original — nenhuma migration histórica
-- preserva o CREATE TABLE original) e validado contra os 3 call-sites de
-- código reais: sicoob-bridge-reply lê via `.eq('contact_id', ...).single()`
-- (um mapping por contato → UNIQUE em contact_id, já que .single() no
-- client Supabase falha se houver 0 ou mais de 1 linha); sicoob-bridge faz
-- o lookup inverso via `.eq('sicoob_user_id', ...).eq('sicoob_singular_id',
-- ...)` (índice de apoio pro lookup, sem UNIQUE — não documentado como tal).
--
-- NOTA IMPORTANTE: zapp.contacts é VIEW (relkind='v', confirmado via
-- pg_class ao vivo), não tabela física — é um SELECT sobre
-- evo.evolution_contacts com 3 triggers INSTEAD OF (insert/update/delete)
-- fazendo a ponte. Postgres não permite FOREIGN KEY contra uma view, então
-- o FK de contact_id abaixo referencia a tabela física
-- evo.evolution_contacts(id) diretamente — equivalente semântico correto,
-- já que é o que a view realmente expõe como `id`.
--
-- RLS: recria só a policy que está no estado CANÔNICO atual (squash
-- 2026-08-04, que é a fonte de verdade pós-hardening) — SELECT para
-- authenticated via zapp.is_contact_visible_to_user()/is_admin_or_supervisor().
-- Não recria a policy legada `auth_full_access` (permissiva, ALL commands)
-- que a própria migration canônica já tinha substituído por esta em
-- 2026-08-01 (RLS Lote 2). Escritas (INSERT do sicoob-bridge) usam
-- service_role, que bypassa RLS — não precisam de policy própria.
--
-- DADOS: nenhum backup/snapshot do conteúdo original foi encontrado — a
-- tabela recria vazia. Mapeamentos de conversas Sicoob Gifts anteriores ao
-- drop (data exata desconhecida) são irrecuperáveis; novos contatos voltam
-- a ser mapeados normalmente a partir desta migration (sicoob-bridge faz o
-- INSERT na próxima mensagem inbound de cada contato novo).
--
-- FORA DE ESCOPO (deliberado): o achado separado e já documentado em
-- 20260821004000_materializa_fn_notify_sicoob_on_reply.sql — o trigger
-- zapp.fn_notify_sicoob_on_reply() não manda header Authorization no
-- net.http_post, então TODA chamada automática ao sicoob-bridge-reply
-- recebe 401 (engolido pelo EXCEPTION WHEN OTHERS silencioso) — continua
-- sem correção aqui, mesma decisão de aguardar sign-off do dono. Recriar
-- esta tabela já restaura o fluxo INBOUND (sicoob-bridge cria/mapeia
-- contatos novos) e o fluxo de resposta MANUAL via frontend (JWT de
-- usuário, que não depende do trigger); só o disparo AUTOMÁTICO via
-- trigger no INSERT de mensagem continua afetado pelo problema de auth
-- separado.
-- =============================================================================

CREATE TABLE zapp.sicoob_contact_mapping (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id         uuid NOT NULL UNIQUE REFERENCES evo.evolution_contacts(id) ON DELETE CASCADE,
  sicoob_user_id     text NOT NULL,
  sicoob_vendedor_id text NOT NULL,
  sicoob_singular_id text NOT NULL,
  zappweb_agent_id   uuid REFERENCES zapp.profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Apoio ao lookup inverso feito por sicoob-bridge/index.ts (novo contato):
-- .eq('sicoob_user_id', ...).eq('sicoob_singular_id', ...)
CREATE INDEX idx_sicoob_contact_mapping_lookup
  ON zapp.sicoob_contact_mapping (sicoob_user_id, sicoob_singular_id);

ALTER TABLE zapp.sicoob_contact_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY sicoob_mapping_select ON zapp.sicoob_contact_mapping FOR SELECT TO authenticated
  USING (zapp.is_contact_visible_to_user(contact_id, auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()));

COMMENT ON TABLE zapp.sicoob_contact_mapping IS
  'Mapeamento contato zapp <-> identidade Sicoob Gifts (sicoob_user_id/vendedor/singular). Escrita via service_role (sicoob-bridge, INSERT em new_message); leitura via service_role (sicoob-bridge-reply) ou authenticated com RLS (sicoob_mapping_select). Recriada em 2026-08-21 após drift não documentado (tabela ausente do banco sem DROP TABLE rastreado) — ver auditoria multi-agente do mesmo dia.';
