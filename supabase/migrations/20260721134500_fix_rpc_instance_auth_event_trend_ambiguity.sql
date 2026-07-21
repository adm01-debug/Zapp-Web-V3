-- Fix: zapp.rpc_instance_auth_event_trend tem DOIS overloads com o MESMO conjunto
-- de nomes de parâmetro (p_hours, p_instance), só mudando a ordem:
--   (p_hours integer DEFAULT 24, p_instance text DEFAULT NULL)
--   (p_instance text,            p_hours integer DEFAULT 24)
--
-- O frontend chama por NOME: .rpc('rpc_instance_auth_event_trend', { p_hours, p_instance }).
-- Com dois candidatos de mesmos nomes, o PostgREST não consegue escolher e retorna
-- PGRST203 ("could not choose the best candidate function") → o painel de tendência
-- de eventos de autenticação de instância quebra.
--
-- Correção: remover o overload redundante (p_instance text, p_hours integer),
-- mantendo o canônico (p_hours, p_instance), que é o que o código usa e tem ambos
-- os parâmetros opcionais.
--
-- Reversível: recriar a função com a assinatura removida, se necessário.

DROP FUNCTION IF EXISTS zapp.rpc_instance_auth_event_trend(p_instance text, p_hours integer);
