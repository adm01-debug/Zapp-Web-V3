# Plano de Endurecimento de RLS / SECURITY DEFINER — ZAPP-WEB v3

> **NÃO aplicar correção em massa às cegas.** Reescrever 236 `USING(true)` sem
> conhecer o modelo de tenant pode **derrubar produção** (lockout ou exposição).
> Este plano usa o estado VIVO como fonte da verdade.

## Superfície (baseline da auditoria de migrations, confirmar com `audit_rls.sql`)
| Achado | Ocorrências (migrations) |
|---|---|
| `USING (true)` | ~236 |
| `WITH CHECK (true)` | ~117 |
| `SECURITY DEFINER` (total) | ~628 |
| `SECURITY DEFINER` com `SET search_path` | ~579 -> ~49 faltando |

## Passo a passo (idealiza->realiza, com checkpoint humano)
1. **Medir o real:** rodar `docs/security/audit_rls.sql` na base viva.
2. **Classificar por sensibilidade** as tabelas: públicas-OK (catálogos) vs. sensíveis (auth, mensagens, pagamentos, tenant).
3. **Definir o predicado de tenant** com o Pink (ex.: `org_id = auth.jwt()->>'org_id'`).
4. **Migration corretiva ÚNICA** (append-only) — ajustar policies sensíveis e fixar `search_path`.
5. **Backup antes** do alvo (padrão `_backup_rls_<data>`).
6. **Staging primeiro**, rodar e2e (auth/inbox/pagamento), só então produção.
7. **`SECURITY DEFINER`:** aplicar `SET search_path = public, pg_temp` nos ~49 sem.

## Critério de pronto
- `audit_rls.sql` (1) retorna 0 linhas em tabelas sensíveis; (4) retorna 0 linhas.
- e2e de auth/RLS/webhook/pagamento verde em staging.
