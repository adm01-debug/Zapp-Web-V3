# 🔒 Branch Protection — `main`

**Status alvo:** ✅ Ativa
**Configuração final:** UI do GitHub (não pode ser feita via API com `GITHUB_TOKEN` padrão)
**Defesa em profundidade:** este repo tem o workflow `branch-protection-sentinel.yml` como camada CI auxiliar.

---

## 1. Por que isso importa

Sem branch protection:
- Qualquer pessoa com acesso write pode `git push --force` em `main` e reescrever histórico
- PRs podem ser mergeados sem revisão
- Gitleaks pode falhar e ser ignorado
- Builds quebrados podem entrar em `main`

Com branch protection:
- Force-push bloqueado
- PR + 1 approval obrigatórios
- CI checks (Gitleaks) bloqueiam merge se falharem
- Histórico imutável → audit trail confiável

## 2. Como ativar (passo a passo no UI)

1. Acessar https://github.com/adm01-debug/zapp-web/settings/branches
2. Clicar em **Add branch protection rule**
3. Em **Branch name pattern**: digitar `main`
4. Marcar (ordem recomendada):
   - ☑ **Require a pull request before merging**
     - ☑ Require approvals → `1`
     - ☑ Dismiss stale pull request approvals when new commits are pushed
   - ☑ **Require status checks to pass before merging
     - ☑ Require branches to be up to date before merging
     - Adicionar ao "Search for status checks":
       - `quality-gate` (lint, ratchets, TS, tests)
       - `typecheck` (TS ratchet via check-tsc-ratchet.mjs)
       - `test:chat` (chat module suite, 14 files)
       - `gitleaks` (security scan)
       - `branch-protection-sentinel` (policy enforcement)
   - ☑ **Require conversation resolution before merging**
   - ☑ **Do not allow bypassing the above settings**
   - ☐ Allow force pushes (deixar **DESmarcado**)
   - ☐ Allow deletions (deixar **DESmarcado**)
5. Clicar em **Create**

## 3. Validação

### Teste 1 — Force push deve falhar

```bash
git checkout main
git commit --allow-empty -m "test: force push attempt"
git push --force origin main
```

Resultado esperado:
```
! [remote rejected] main -> main (protected branch hook declined)
```

### Teste 2 — PR sem approval não merge

Abrir um PR simples e clicar em **Merge** sem aprovar primeiro. O botão deve estar **desabilitado**.

### Teste 3 — CI vermelho bloqueia merge

Abrir PR com `package.json` malformado de propósito. Mesmo com 1 approval, merge fica bloqueado até CI ficar verde.

## 4. Workflow auxiliar (defesa em profundidade)

`.github/workflows/branch-protection-sentinel.yml` é uma camada CI que detecta padrões anômalos de push em `main` e falha o build. **Não substitui a configuração UI**, mas:

- Documenta a política como código
- Serve de audit log na aba Actions
- Cobre o caso de admin contornar inadvertidamente

## 5. Exceções operacionais

Nenhuma. Hotfixes seguem o mesmo fluxo PR + approval. Se houver incidente que exija bypass, registrar em `docs/INCIDENTS/` com justificativa.

## 6. Revisão periódica

A cada trimestre:
- Confirmar que regra continua ativa
- Revisar lista de status checks obrigatórios
- Auditar logs de override
