# Vercel Deployment — Segurança em DELETE

## Risco
A API Vercel aceita deletar qualquer deployment, inclusive o que está servindo producao. O CLI protege apenas com a flag `--safe` (opt-in).

## Regras
1. **NUNCA** rodar `vercel rm` / `vercel remove` sem `--safe`.
2. A flag `--safe` impede deletar o deployment que esta servindo o alias de producao.
3. Para deletar manualmente, SEMPRE usar: `vercel remove <deployment-id> --safe`
4. Em scripts de CI/housekeeping, validar com `vercel ls --prod` qual e o deployment ativo ANTES de deletar.

## Referencia
- Vercel CLI docs: `vercel remove --help`
- Projeto: juca1/zapp-web-v3