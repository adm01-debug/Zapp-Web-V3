# Playbook: Acessando Banco de Dados Supabase de Projetos Lovable

> **Arquitetura atual**: Supabase Self-Hosted (`supabase.atomicabr.com.br`), schema `zapp`. Veja [../SCHEMA_REFERENCE.md](SCHEMA_REFERENCE.md).
>
> **Atualização jul/2026**: acesso a banco externo (FATOR X) encerrado — consolidação em um único Supabase self-hosted (schemas `zapp`/`evo`). As linhas abaixo que citam o FATOR X cloud ficam como referência histórica.


> **Autor**: Claude (sessão 29-30/04/2026 com Joaquim / Promo Brindes)
> **Versão**: 1.0 — 01/05/2026
> **Uso**: Documentação interna para Claude. Consultar sempre que precisar acessar, diagnosticar ou migrar o Supabase de qualquer projeto Lovable.

---

## TL;DR — Resumo Executivo

- Projetos Lovable criam Supabase na **org da Lovable** (não do usuário)
- PAT do usuário e MCP OAuth **NÃO acessam** esses projetos
- Credenciais ficam no **código-fonte** (repo GitHub): `.env.example`, `supabase/config.toml`, testes com `eyJ*`
- A Lovable **regenera** `client.ts` a cada build — editar via GitHub é inútil
- Tela branca = integração Supabase desconectada no painel Lovable
- O ZAPP Web usa **um único** Supabase Self-Hosted: `supabase.atomicabr.com.br` (schemas `zapp`/`evo`). O FATOR X cloud (`tdprnylgyrogbbhgdoik`) foi **descontinuado em jul/2026** (dados consolidados no self-hosted)

---

## Checklist Rápida — Novo Projeto Lovable

```
1. Clonar repo: git clone https://github.com/adm01-debug/{repo}.git
2. Project ref: cat supabase/config.toml | grep project_id
3. URL: grep VITE_SUPABASE .env.example
4. Anon key: grep -rn 'eyJ' src/ --include='*.ts' --include='*.tsx'
5. Se não achou key → extrair do bundle JS em produção
6. Testar: curl -s https://{ref}.supabase.co/rest/v1/ -H 'apikey: {key}'
7. Edge functions: ls supabase/functions/
8. Migrations: ls supabase/migrations/
```

---

## Credenciais Conhecidas

| Projeto | Ref | Anon Key | Acesso PAT |
|---|---|---|---|
| ZAPP Web (Lovable) | allrjhkpuscmgbsnmjlv | eyJ...HA74 (do test file) | ❌ |
| FATOR X — ⚠️ descontinuado (jul/2026) | tdprnylgyrogbbhgdoik | eyJ...PZMSI | — |
| time_promo | hncgwjbzdajfdztqgefe | via PAT | ✅ |
| bancodadosclientes | pgxfvjmuubtbowutlide | via PAT | ✅ |
| supabase-fuchsia-kite | doufsxqlfjyuvxuezpln | via PAT | ✅ |

---

## Armadilhas Críticas

1. **NUNCA editar `src/integrations/supabase/client.ts`** — Lovable regenera
2. **Tela branca → problema no painel Lovable**, não no código
3. **Headless browsers mostram branco mesmo quando app funciona** — testar no browser real
4. **ZAPP Web usa 1 Supabase** (desde jul/2026) — tudo no self-hosted `supabase.atomicabr.com.br` (schemas `zapp`/`evo`); FATOR X cloud descontinuado
5. **`VITE_SUPABASE_PUBLISHABLE_KEY` ≠ `VITE_SUPABASE_ANON_KEY`** — Lovable usa nome diferente

*Playbook completo em /workspace/notes/playbooks/ na VPS*
