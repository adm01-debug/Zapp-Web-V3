# Política de Segurança — ZAPP-WEB (Pronto Talk Suite)

## Versões suportadas
A branch `main` (produção) é a única com suporte de segurança ativo.

## Reportar uma vulnerabilidade
Envie para **ti@promobrindes.com.br** com:
- descrição e impacto,
- passos de reprodução,
- componente/arquivo afetado.
Não abra issue pública para vulnerabilidades.

## Postura atual (gerada na auditoria de produção)
- **Segredos:** nenhuma anon key/JWT hardcoded em `src/` — todas via `import.meta.env`.
- **CVEs de dependência:** `xlsx` fixado no tarball oficial SheetJS (mitiga Prototype Pollution CVSS 7.8).
- **Observabilidade:** Sentry (`@sentry/react`) captura exceções e replay em produção.
- **Headers HTTP (nginx):** `X-Frame-Options`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.

## Itens em endurecimento (ver docs/security/RLS_HARDENING_PLAN.md)
- RLS: políticas com `USING (true)` / `WITH CHECK (true)` em revisão por tenant.
- `SECURITY DEFINER` sem `SET search_path` em correção.
- Token de auth em `localStorage` (padrão SPA + PKCE) — avaliar storage endurecido.

## Itens que exigem ação de operador (fora do código)
- [ ] Ativar **Secret scanning + Push protection** no repositório (Settings → Security).
- [ ] Ativar **Dependabot security updates**.
- [ ] Garantir rotação de qualquer credencial exposta historicamente.
