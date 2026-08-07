# Plano de 50 Etapas — Sistema "Lovable Local" no PC (ZAPP Web v3)

**Objetivo:** Transformar o Hermes em um estúdio tipo Lovable: ver alterações de código em tempo real + design, tudo no PC local via Hermes Desktop.

## FASE 1 — DIAGNÓSTICO E LIMPEZA (etapas 1-10)
1. ✅ Verificar versões (bun 1.3.14, node v24.18.0)
2. ✅ Verificar git (branch fix/onda-bugs-console-v1, 17 mudanças)
3. ✅ Verificar .env (8 chaves)
4. ✅ Verificar porta configurada (8080 no vite.config)
5. ✅ Diagnosticar processos node ativos e portas ocupadas
6. ✅ Matar dev servers órfãos (5173/8080) para arquitetura limpa
7. ✅ Verificar node_modules íntegro
8. ✅ Verificar se Hermes Desktop está ativo
9. ✅ Verificar Chrome CDP compartilhado (para screenshots de design)
10. ✅ Snapshot do estado atual (branch, diff, dist)

## FASE 2 — INFRAESTRUTURA DE PREVIEW (etapas 11-22)
11. ✅ Criar pasta scripts/preview com logs
12. ✅ Criar start-preview.sh (dev server HMR na 8080)
13. ✅ Criar stop-preview.sh (mata só o dev server)
14. ✅ Criar restart-preview.sh (stop + start)
15. ✅ Criar health-check.sh (curl + relatório legível)
16. ✅ Criar preview-static.sh (build + serve 4173, fallback)
17. ✅ Subir dev server na 8080
18. ✅ Testar HTTP 200 na 8080
19. ✅ Testar HMR (editar arquivo → resposta do vite)
20. ✅ Testar fallback estático (4173)
21. ✅ Criar diff-report.sh (resumo git diff legível p/ chat)
22. ✅ Criar screenshot-design.sh (print via CDP)

## FASE 3 — INTEGRAÇÃO HERMES / DESKTOP (etapas 23-34)
23. ✅ Registrar fluxo no Hermes (open_preview → localhost:8080)
24. ✅ Criar skill lovable-local-preview (arquitetura + comandos)
25. ✅ Configurar watch: mudanças → report automático
26. ✅ Template de prompt de design (cor, layout, componentes)
27. ✅ Template de prompt de código (lógica, APIs, bugs)
28. ✅ Verificação pós-edição: typecheck (bunx tsc --noEmit)
29. ✅ Verificação pós-edição: lint (eslint --max-warnings 6)
30. ✅ Pipeline ciclo completo: editar → typecheck → lint → build
31. ✅ Screenshot pós-build automático para o chat
32. ✅ Documentar fluxo Desktop (preview pane + review pane)
33. ✅ Testar review pane (git diff em tempo real)
34. ✅ Validar que preview atualiza após edição real

## FASE 4 — AUTOMAÇÃO E CONVENIÊNCIA (etapas 35-44)
35. ✅ Script ciclov-completa.sh (tudo em 1 comando)
36. ✅ Cron/daemon de health check do dev server
37. ✅ Alerta se dev server cair (restart automático)
38. ✅ Log de sessão em scripts/preview/logs/
39. ✅ Backup do plano + scripts no repo (docs/)
40. ✅ Script status.sh (resumo: porta, git, dist, uptime)
41. ✅ Limpeza de artefatos órfãos (br.gz, buildrecord, dev/)
42. ✅ Gitignore para scripts/preview/logs
43. ✅ Teste de resiliência (matar server → restart automático)
44. ✅ Validar .env de produção vs local (sem segredos expostos)

## FASE 5 — VALIDAÇÃO FINAL E ENTREGA (etapas 45-50)
45. ✅ Teste completo: start → health → screenshot → report
46. ✅ Teste de edição real (mudança visível no preview)
47. ✅ Typecheck + lint + build finais (0 erros)
48. ✅ Screenshot final do app rodando
49. ✅ Atualizar skills (web-project-preview + hermes-preview-setup)
50. ✅ Entrega: resumo final + instruções de uso para Joaquim
