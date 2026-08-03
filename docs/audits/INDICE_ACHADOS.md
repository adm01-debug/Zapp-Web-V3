> **Nota histórica**: Este documento refere-se ao banco 'FATOR X' (projeto Supabase `tdprnylgyrogbbhgdoik`), descomissionado em 2026-07-15. O termo foi mantido para rastreabilidade histórica.

# INDICE DE ACHADOS — leia isto antes de abrir o plano

> **Arquivo derivado. Nao edite a mao.** Regenere com `node scripts/gerar-indice-achados.mjs`
> depois de qualquer mudanca em `PLANO_IMPLEMENTACAO_100.md` ou `PLANO_CORRECAO_20_ETAPAS.md`.
> O gate `scripts/check-audit-docs-integrity.sh` reprova se este indice ficar dessincronizado.
>
> Gerado em 2026-08-02 a partir de 200 achados e 20 etapas.

## Para que serve

O `PLANO_IMPLEMENTACAO_100.md` tem 222 KB. Este indice responde, sem varrer o arquivo:

- quais achados pertencem a etapa que vou executar;
- o que bloqueia cada achado (`Depende de:`) e se o bloqueador vem antes ou depois na esteira;
- se o achado tem **Acao** e **Aceite** escritos, ou se e so um titulo-resumo que precisa ser especificado antes;
- qual procedimento de rollback se aplica (`R-POL`, `R-FN`, `R-VIEW`, `R-CRON`, `R-DDL`, `R-CODE`) — ausencia significa que a Acao nao altera producao;
- em que linha do plano o corpo completo comeca.

## Defeitos de esteira — leia antes de planejar a sessao

Todos medidos por cruzamento dos dois documentos. Nenhum e visivel lendo um so.

| # | Defeito | Qtd | Efeito pratico |
|---|---|---:|---|
| 1 | **Achados ativos sem etapa** | 55 | Executar as 20 etapas na ordem **nao** esgota o backlog. Ficam de fora 3 `SEC` e 10 `QUEBRADO`. |
| 2 | **Dependencia em ordem invertida** | 7 | O achado esta numa etapa anterior a do seu pre-requisito. Seguir a ordem numerica ativa bug latente ou desperdica a sessao. |
| 3 | **Obsoletos ainda alocados** | 8 | A etapa lista o achado, mas ele ja foi revalidado como falso positivo. O agente gasta tempo ate ler o veredito. |
| 4 | **Alocados sem Acao escrita** | 19 | Sao titulos-resumo. Precisam de Acao e Aceite **antes** de entrar na esteira. |

### Dependencias em ordem invertida (detalhe)

| Achado | Etapa | Depende de | Etapa do pre-requisito |
|---|---:|---|---:|
| `F5-04` | 7 | `F5-08` | **17** |
| `F8-05` | 12 | `F8-02` | **13** |
| `F8-05` | 12 | `F8-03` | **13** |
| `F8-06` | 4 | `F8-02` | **13** |
| `F8-14` | 12 | `F8-03` | **13** |
| `F8-15` | 12 | `F8-02` | **13** |
| `F8-17` | 5 | `F8-03` | **13** |

Encaminhamento: **nao** renumerar etapa nem mover achado por conta propria. Executar o pre-requisito antes e registrar o desvio no `RELATORIO_CORRECAO.md`, como foi feito com `F1-06` na Etapa 2.

### Obsoletos ainda listados em etapas (nao executar)

`F4-24` (Etapa 12) · `F5-14` (Etapa 4) · `F6-10` (Etapa 12) · `F7-15` (Etapa 12) · `F7-16` (Etapa 10) · `F7-32` (Etapa 18) · `F8-01` (Etapa 13) · `F8-10` (Etapa 20)

### Achados ativos que nenhuma etapa cobre

Decidir explicitamente: alocar numa etapa existente, criar etapa nova, ou marcar fora de escopo com justificativa. **Silencio aqui vira divida invisivel.**

| Sev | Achados |
|---|---|
| `SEC` | `F3-02` · `F7-12` · `F7-28` |
| `QUEBRADO` | `F4-18` · `F7-04` · `F7-05` · `F7-09` · `F7-10` · `F7-11` · `F7-20` · `F7-25` · `F7-27` · `F7-30` |
| `RISCO` | `F1-04` · `F3-04` · `F3-05` · `F3-06` · `F3-07` · `F3-09` · `F4-02` · `F4-03` · `F4-05` · `F4-06` · `F4-07` · `F4-11` · `F4-12` · `F4-16` · `F4-17` · `F4-19` · `F7-19` · `F7-22` · `F7-23` · `F7-24` · `F7-29` · `F7-31` |
| `DEGRADADO` | `F3-10` · `F4-04` · `F4-08` · `F4-10` · `F4-20` · `F4-21` · `F7-07` · `F7-08` |
| `HIGIENE` | `F1-02` · `F1-03` · `F1-05` · `F1-06` · `F1-07` · `F1-08` · `F3-11` · `F4-09` · `F7-02` · `F7-03` · `F7-06` · `F7-26` |

## Achados por etapa

### Etapa 1 — Revalidar e recalibrar o backlog ✅

_Nenhum achado listado na linha `**Achados:**` desta etapa._

### Etapa 2 — Ligar a rede de segurança do CI ✅

| Achado | Sev | Acao | Aceite | Rollback | Depende de | Linha |
|---|---|---|---|---|---|---:|
| `F1-10` | `QUEBRADO` | **nao** | **nao** | — | — | 91 |
| `F1-11` | `HIGIENE` | **nao** | **nao** | — | — | 100 |
| `F10-02` | `HIGIENE` | sim | sim | — | **F10-09** (apontar o `testDir` certo é pré-requisito para o | 2280 |
| `F10-04` | `HIGIENE` | sim | sim | — | — | 2319 |
| `F10-05` | `HIGIENE` | sim | sim | — | — | 2344 |
| `F10-06` | `QUEBRADO` | sim | sim | — | **F1-10** (mesma classe: gate de CI que nunca reprova — trat | 2368 |
| `F10-09` | `HIGIENE` | sim | sim | — | — | 2428 |
| `F6-26` | `HIGIENE` | sim | sim | — | — | 1174 |

### Etapa 3 — Credenciais e sessão JWT

| Achado | Sev | Acao | Aceite | Rollback | Depende de | Linha |
|---|---|---|---|---|---|---:|
| `F9-16` 🔄 | `SEC` | sim | sim | — | — | 2157 |
| `F9-17` 🔄 | `SEC` | sim | sim | R-POL | — | 2183 |
| `F9-18` 🔄 | `DEGRADADO` | sim | sim | — | — | 2213 |

### Etapa 4 — Isolamento multi-tenant

| Achado | Sev | Acao | Aceite | Rollback | Depende de | Linha |
|---|---|---|---|---|---|---:|
| `F5-14` ⛔ 🔄 | `OBSOLETO` | sim | sim | R-POL | — | 666 |
| `F5-15` | `SEC` | sim | sim | R-POL | — | 678 |
| `F5-16` | `SEC` | sim | sim | R-POL + R-VIEW | — | 689 |
| `F5-20` | `SEC` | sim | sim | R-POL | — | 735 |
| `F6-17` | `SEC` | sim | sim | R-POL | — | 1070 |
| `F6-27` | `SEC` | sim | sim | R-POL | — | 1194 |
| `F8-06` | `SEC` | sim | sim | R-POL | **F8-02** — se o schema for removido, o achado desaparece | 1691 |

### Etapa 5 — SECURITY DEFINER e grants

| Achado | Sev | Acao | Aceite | Rollback | Depende de | Linha |
|---|---|---|---|---|---|---:|
| `F2-01` | `SEC` | **nao** | **nao** | R-POL | — | 110 |
| `F2-02` | `SEC` | **nao** | **nao** | R-POL | — | 116 |
| `F2-03` | `SEC` | **nao** | **nao** | R-POL | — | 122 |
| `F2-04` | `SEC` | **nao** | **nao** | — | — | 128 |
| `F2-05` | `SEC` | **nao** | **nao** | — | — | 131 |
| `F6-07` | `RISCO` | sim | sim | R-POL | — | 945 |
| `F6-18` | `SEC` | sim | sim | R-POL | — | 1081 |
| `F8-11` | `HIGIENE` | sim | sim | R-POL | — | 1753 |
| `F8-17` | `RISCO` | sim | sim | R-FN + R-VIEW | **F8-03** | 1828 |

### Etapa 6 — View `zapp.contacts` e seus triggers (causa-raiz)

| Achado | Sev | Acao | Aceite | Rollback | Depende de | Linha |
|---|---|---|---|---|---|---:|
| `F5-01` | `QUEBRADO` | sim | sim | R-FN + R-VIEW | — | 496 |
| `F5-02` | `QUEBRADO` | sim | sim | R-FN | **F5-01** (view `zapp.contacts` incompleta — corrigir a view | 506 |
| `F5-03` | `SEC` | sim | sim | R-FN | **F5-01** | 519 |
| `F5-27` | `QUEBRADO` | sim | sim | R-FN | — | 812 |
| `F5-29` | `RISCO` | sim | sim | R-DDL | — | 835 |

### Etapa 7 — RPCs de contatos dependentes da view

| Achado | Sev | Acao | Aceite | Rollback | Depende de | Linha |
|---|---|---|---|---|---|---:|
| `F5-04` | `QUEBRADO` | sim | sim | R-FN | **F5-08** (merge depende de uma estratégia única de normaliz | 533 |
| `F5-05` | `QUEBRADO` | sim | sim | R-DDL + R-FN + R-VIEW | **F5-01** (as colunas citadas só existem depois de a view se | 545 |
| `F5-09` | `QUEBRADO` | sim | sim | R-DDL + R-FN | **F5-01** | 605 |
| `F5-10` | `SEC` | sim | sim | R-POL | — | 618 |
| `F5-11` | `QUEBRADO` | sim | sim | — | **F5-09** e **F5-10** (a tabela só recebe linhas depois de a | 631 |
| `F5-30` | `HIGIENE` | sim | sim | R-CODE | — | 846 |

### Etapa 8 — Conformidade LGPD

| Achado | Sev | Acao | Aceite | Rollback | Depende de | Linha |
|---|---|---|---|---|---|---:|
| `F5-06` | `QUEBRADO` | sim | sim | R-DDL + R-FN + R-VIEW | **F5-01** | 559 |
| `F5-07` | `QUEBRADO` | sim | sim | R-FN | — | 572 |
| `F5-18` | `SEC` | sim | sim | — | — | 712 |
| `F5-26` | `SEC` | sim | sim | R-FN | — | 799 |
| `F5-28` | `SEC` | sim | sim | R-FN | — | 823 |
| `F7-17` | `SEC` | sim | sim | — | — | 1439 |

### Etapa 9 — Silenciar o ruído e recuperar os alertas reais

| Achado | Sev | Acao | Aceite | Rollback | Depende de | Linha |
|---|---|---|---|---|---|---:|
| `F9-07` | `DEGRADADO` | sim | sim | R-FN | — | 1952 |
| `F9-08` | `DEGRADADO` | sim | sim | R-CRON | — | 1977 |
| `F6-08` | `DEGRADADO` | sim | sim | R-FN | — | 956 |
| `F6-22` | `DEGRADADO` | sim | sim | — | — | 1124 |
| `F6-23` | `DEGRADADO` | sim | sim | — | — | 1136 |
| `F7-14` | `DEGRADADO` | sim | sim | R-CRON + R-FN | — | 1398 |
| `F8-16` | `RISCO` | sim | sim | R-CRON | — | 1816 |

### Etapa 10 — `dblink` e o deadman switch

| Achado | Sev | Acao | Aceite | Rollback | Depende de | Linha |
|---|---|---|---|---|---|---:|
| `F9-12` | `QUEBRADO` | sim | sim | R-CRON + R-FN | — | 2079 |
| `F9-13` | `QUEBRADO` | sim | sim | R-CRON + R-FN | — | 2101 |
| `F9-14` | `RISCO` | sim | sim | R-FN | — | 2124 |
| `F7-16` ⛔ 🔄 | `OBSOLETO` | sim | sim | R-CRON | **F9-13** (mesma causa-raiz: `search_path` sem `zapp`) — amb | 1426 |

### Etapa 11 — DLQ e filas de mensagem

| Achado | Sev | Acao | Aceite | Rollback | Depende de | Linha |
|---|---|---|---|---|---|---:|
| `F9-09` | `QUEBRADO` | sim | sim | R-CRON | **F9-10** — **pré-requisito**: corrigir F9-09 antes de F9-10 | 1993 |
| `F9-10` | `QUEBRADO` | sim | sim | R-FN | — | 2018 |
| `F9-11` | `RISCO` | sim | sim | R-POL | — | 2042 |
| `F9-15` | `HIGIENE` | sim | sim | R-DDL | — | 2141 |
| `F4-14` | `RISCO` | sim | sim | — | — | 380 |
| `F4-23` | `QUEBRADO` | sim | sim | R-CRON | — | 457 |

### Etapa 12 — Crons quebrados, no-op e mal escalonados

| Achado | Sev | Acao | Aceite | Rollback | Depende de | Linha |
|---|---|---|---|---|---|---:|
| `F2-06` | `DEGRADADO` | **nao** | **nao** | R-CRON | — | 176 |
| `F2-07` | `DEGRADADO` | **nao** | **nao** | R-CRON | — | 185 |
| `F2-08` | `DEGRADADO` | **nao** | **nao** | R-CRON | — | 189 |
| `F2-09` | `DEGRADADO` | **nao** | **nao** | R-CRON | — | 140 |
| `F2-12` | `DEGRADADO` | **nao** | **nao** | — | — | 151 |
| `F4-24` ⛔ 🔄 | `OBSOLETO` | sim | sim | R-CRON | — | 469 |
| `F6-09` | `RISCO` | sim | sim | R-CRON | — | 968 |
| `F6-10` ⛔ 🔄 | `OBSOLETO` | sim | sim | R-CRON | — | 980 |
| `F7-15` ⛔ 🔄 | `OBSOLETO` | sim | sim | R-CRON + R-FN | **F4-24** — mesmo cron (jobid 213), achado duplicado; ambos  | 1411 |
| `F8-05` | `QUEBRADO` | sim | sim | R-CRON + R-FN | **F8-02** e **F8-03** | 1678 |
| `F8-09` | `QUEBRADO` | sim | sim | R-CRON | — | 1728 |
| `F8-14` | `QUEBRADO` | sim | sim | R-CRON | **F8-03** | 1792 |
| `F8-15` | `DEGRADADO` | sim | sim | R-DDL | **F8-02** | 1804 |

### Etapa 13 — Decisões arquiteturais com Abner/Pink

| Achado | Sev | Acao | Aceite | Rollback | Depende de | Linha |
|---|---|---|---|---|---|---:|
| `F8-01` ⛔ 🔄 | `OBSOLETO` | sim | sim | R-CODE | — | 1618 |
| `F8-02` | `QUEBRADO` | sim | sim | R-CRON + R-DDL | — | 1632 |
| `F8-03` | `RISCO` | sim | sim | — | — | 1646 |
| `F8-04` | `QUEBRADO` | sim | sim | R-FN | **F8-02** (decisão sobre o schema `bpm`) e **F8-03** (qual s | 1664 |
| `F8-07` | `QUEBRADO` | sim | sim | — | — | 1704 |
| `F8-08` | `QUEBRADO` | sim | sim | R-VIEW | **F8-03** | 1714 |
| `F8-13` | `HIGIENE` | sim | sim | R-DDL | — | 1781 |
| `F9-01` | `HIGIENE` | sim | sim | R-CODE | — | 1854 |
| `F9-02` | `QUEBRADO` | sim | sim | — | — | 1871 |
| `F9-03` | `QUEBRADO` | sim | sim | — | — | 1891 |
| `F10-03` | `HIGIENE` | sim | sim | R-CODE | — | 2300 |
| `F10-08` | `HIGIENE` | sim | sim | — | — | 2409 |

### Etapa 14 — Conexões WhatsApp: fonte única de verdade

| Achado | Sev | Acao | Aceite | Rollback | Depende de | Linha |
|---|---|---|---|---|---|---:|
| `F6-01` | `QUEBRADO` | sim | sim | — | — | 866 |
| `F6-02` | `QUEBRADO` | sim | sim | — | — | 877 |
| `F6-03` | `QUEBRADO` | sim | sim | R-VIEW | **F6-04** (definir a fonte canônica antes de reconciliar o e | 889 |
| `F6-04` | `RISCO` | sim | sim | — | — | 907 |
| `F6-05` | `QUEBRADO` | sim | sim | R-FN | — | 919 |
| `F6-06` | `RISCO` | sim | sim | R-FN | **F6-04** | 931 |
| `F6-11` | `RISCO` | sim | sim | R-FN | — | 993 |
| `F6-12` | `SEC` | sim | sim | R-FN | — | 1009 |
| `F6-13` | `RISCO` | sim | sim | R-DDL | **F6-04** | 1020 |
| `F6-14` | `HIGIENE` | sim | sim | — | **F6-04** | 1033 |
| `F6-15` | `HIGIENE` | sim | sim | — | — | 1045 |
| `F6-16` | `SEC` | sim | sim | R-FN | **F6-04** | 1057 |
| `F6-19` | `QUEBRADO` | sim | sim | — | — | 1090 |
| `F6-20` | `QUEBRADO` | sim | sim | — | — | 1100 |
| `F6-21` | `QUEBRADO` | sim | sim | R-FN | — | 1111 |
| `F6-24` | `HIGIENE` | sim | sim | — | **F6-04** | 1148 |
| `F6-25` | `QUEBRADO` | sim | sim | R-FN | — | 1161 |
| `F6-28` | `RISCO` | sim | sim | — | — | 1206 |
| `F6-29` | `RISCO` | sim | sim | — | — | 1218 |
| `F6-30` | `HIGIENE` | sim | sim | R-DDL | — | 1228 |

### Etapa 15 — Inbox e mensageria

| Achado | Sev | Acao | Aceite | Rollback | Depende de | Linha |
|---|---|---|---|---|---|---:|
| `F4-01` | `DEGRADADO` | sim | sim | — | — | 278 |
| `F4-13` | `RISCO` | sim | sim | — | — | 372 |
| `F4-15` | `DEGRADADO` | sim | sim | — | — | 388 |
| `F4-22` | `DEGRADADO` | sim | sim | — | — | 449 |

### Etapa 16 — Autenticação e sessão

| Achado | Sev | Acao | Aceite | Rollback | Depende de | Linha |
|---|---|---|---|---|---|---:|
| `F3-01` | `SEC` | sim | sim | — | — | 215 |
| `F3-12` | `SEC` | **nao** | **nao** | — | — | 265 |

### Etapa 17 — Busca e performance de contatos

| Achado | Sev | Acao | Aceite | Rollback | Depende de | Linha |
|---|---|---|---|---|---|---:|
| `F5-08` | `RISCO` | sim | sim | — | — | 585 |
| `F5-12` | `DEGRADADO` | sim | sim | — | — | 643 |
| `F5-13` | `SEC` | sim | sim | R-DDL | — | 654 |
| `F5-17` | `RISCO` | sim | sim | — | — | 702 |
| `F5-19` | `QUEBRADO` | sim | sim | R-FN + R-VIEW | — | 723 |
| `F5-21` | `DEGRADADO` | sim | sim | — | — | 744 |
| `F5-22` | `DEGRADADO` | sim | sim | — | **F5-08** | 755 |
| `F5-23` | `DEGRADADO` | sim | sim | — | — | 766 |
| `F5-24` | `DEGRADADO` | sim | sim | — | — | 776 |
| `F5-25` | `DEGRADADO` | sim | sim | — | — | 788 |

### Etapa 18 — Admin: remover mocks e dados falsos

| Achado | Sev | Acao | Aceite | Rollback | Depende de | Linha |
|---|---|---|---|---|---|---:|
| `F7-01` | `HIGIENE` | sim | sim | — | — | 1252 |
| `F7-13` | `QUEBRADO` | sim | sim | R-CODE | decisão de produto da **Etapa 13** (rate limiting existe ou  | 1385 |
| `F7-18` | `QUEBRADO` | sim | sim | — | — | 1450 |
| `F7-32` ⛔ 🔄 | `OBSOLETO` | sim | sim | — | — | 1599 |

### Etapa 19 — Resiliência unificada e cross-browser

| Achado | Sev | Acao | Aceite | Rollback | Depende de | Linha |
|---|---|---|---|---|---|---:|
| `F9-04` | `RISCO` | sim | sim | — | — | 1906 |
| `F9-05` | `HIGIENE` | sim | sim | R-CODE | — | 1921 |
| `F9-06` | `DEGRADADO` | sim | sim | — | — | 1937 |
| `F9-19` | `RISCO` | sim | sim | — | — | 2233 |
| `F10-01` | `HIGIENE` | sim | sim | — | — | 2263 |
| `F10-07` | `HIGIENE` | sim | sim | — | — | 2394 |

### Etapa 20 — Higiene, dead code e fechamento

| Achado | Sev | Acao | Aceite | Rollback | Depende de | Linha |
|---|---|---|---|---|---|---:|
| `F1-01` | `HIGIENE` | sim | sim | R-CODE | — | 46 |
| `F1-09` | `RISCO` | **nao** | **nao** | R-CODE | — | 83 |
| `F1-12` | `HIGIENE` | **nao** | **nao** | — | — | 197 |
| `F1-13` | `HIGIENE` | **nao** | **nao** | — | **F1-14** | 200 |
| `F1-14` | `HIGIENE` | **nao** | **nao** | — | — | 205 |
| `F2-10` | `DEGRADADO` | **nao** | **nao** | R-DDL | — | 144 |
| `F2-11` | `DEGRADADO` | **nao** | **nao** | — | — | 148 |
| `F2-13` | `DEGRADADO` | sim | sim | R-DDL | — | 154 |
| `F8-10` ⛔ 🔄 | `OBSOLETO` | sim | **nao** | R-CODE | — | 1741 |
| `F8-12` | `HIGIENE` | sim | sim | R-CODE | — | 1768 |

## Todos os 200 achados

`⛔` = obsoleto, fora da esteira. `🔄` = revalidado nas Etapas 1-3. Coluna **Etapa** vazia = nao alocado.

| Achado | Sev | Etapa | Acao | Aceite | Rollback | Linha | Titulo |
|---|---|---:|---|---|---|---:|---|
| `F1-01`  | `HIGIENE` | 20 | sim | sim | R-CODE | 46 | Deletar `___TEMP_VERSION_CHECK_DO_NOT_MERGE.txt` |
| `F1-02`  | `HIGIENE` |  | sim | **nao** | R-CODE | 52 | Ignorar e remover `__pycache__/` |
| `F1-03`  | `HIGIENE` |  | sim | **nao** | — | 57 | Mover scripts soltos para `scripts/` |
| `F1-04`  | `RISCO` |  | sim | **nao** | R-DDL | 62 | Migrar `lgpd_deploy.sql` para `supabase/migrations/` |
| `F1-05`  | `HIGIENE` |  | **nao** | **nao** | — | 67 | Mover 8 relatórios `.md` da raiz para `docs/audits/history/` |
| `F1-06`  | `HIGIENE` |  | **nao** | **nao** | R-CODE | 71 | Deletar duplicata `playwright.e2e.config.fixed.ts` |
| `F1-07`  | `HIGIENE` |  | **nao** | **nao** | — | 76 | Consolidar 5 pastas de teste em `src/**/__tests__/` + `e2e/` |
| `F1-08`  | `HIGIENE` |  | **nao** | **nao** | R-CODE | 79 | Deletar `supabase/functions-legacy/` (grep imports antes) |
| `F1-09`  | `RISCO` | 20 | **nao** | **nao** | R-CODE | 83 | Mover/deletar `supabase/fatorx-migrations/` (projeto errado) |
| `F1-10`  | `QUEBRADO` | 2 | **nao** | **nao** | — | 91 | Remover `\|\| true` do script `lint` em `package.json` |
| `F1-11`  | `HIGIENE` | 2 | **nao** | **nao** | — | 100 | Reduzir `--max-warnings 999 → 0` progressivamente |
| `F1-12`  | `HIGIENE` | 20 | **nao** | **nao** | — | 197 | Homônimos em `src/pages/` — padronizar `<slug>/index.tsx` |
| `F1-13`  | `HIGIENE` | 20 | **nao** | **nao** | — | 200 | 11 pages órfãs (sem `<Route>`) mas lazy-carregadas — decidir URL ou `?view=` |
| `F1-14`  | `HIGIENE` | 20 | **nao** | **nao** | — | 205 | Consolidar padrão duplo URL canônica vs `?view=X&tab=Y` |
| `F2-01`  | `SEC` | 5 | **nao** | **nao** | R-POL | 110 | Revogar `EXECUTE` de `authenticated` nas 6 TRIGGER functions em `public` |
| `F2-02`  | `SEC` | 5 | **nao** | **nao** | R-POL | 116 | Revogar `EXECUTE` de `authenticated` nas 3 outras TRIGGER functions em `public` |
| `F2-03`  | `SEC` | 5 | **nao** | **nao** | R-POL | 122 | Revisar 9 RPCs SECDEF em `public` — garantir `auth.uid()` + tenant check |
| `F2-04`  | `SEC` | 5 | **nao** | **nao** | — | 128 | Auditoria CSV das 119 SECDEF+authenticated em `zapp` (`docs/audits/secdef-zapp.csv`) |
| `F2-05`  | `SEC` | 5 | **nao** | **nao** | — | 131 | Auditoria similar em `financeiro` (25), `artes` (11), `vendas` (5) |
| `F2-06`  | `DEGRADADO` | 12 | **nao** | **nao** | R-CRON | 176 | Consolidar 4 pares de duplicatas de cron |
| `F2-07`  | `DEGRADADO` | 12 | **nao** | **nao** | R-CRON | 185 | Escalonar 6 VACUUMs diários (02:06–02:21) em janelas > 5 min |
| `F2-08`  | `DEGRADADO` | 12 | **nao** | **nao** | R-CRON | 189 | Reagrupar chain logflare (7 jobs, 03:00–03:45) em job único |
| `F2-09`  | `DEGRADADO` | 12 | **nao** | **nao** | R-CRON | 140 | Mover `ops.fn_regression_tests()` para off-peak + MV cached (8,8 s/call → 0) |
| `F2-10`  | `DEGRADADO` | 20 | **nao** | **nao** | R-DDL | 144 | Consolidar 588 042 INSERTs unitários em `financeiro.pagamentos_diarios` para batch |
| `F2-11`  | `DEGRADADO` | 20 | **nao** | **nao** | — | 148 | Investigar `zapp.fn_system_health_score_cached` (289 ms apesar do nome "_cached") |
| `F2-12`  | `DEGRADADO` | 12 | **nao** | **nao** | — | 151 | Reduzir invalidações do PostgREST schema cache (203 s totais em introspection) |
| `F2-13`  | `DEGRADADO` | 20 | sim | sim | R-DDL | 154 | Índice parcial em `zapp.messages` para badge unread inbound |
| `F3-01`  | `SEC` | 16 | sim | sim | — | 215 | CRÍTICO (P0): `supabase.auth.getSession()` fora de `useEffect` em `ProtectedRoute.tsx` |
| `F3-02`  | `SEC` |  | sim | sim | — | 224 | `isDev` bypass total sem log de auditoria |
| `F3-03` ⛔🔄 | `OBSOLETO` |  | **nao** | **nao** | R-CODE | 232 | OBSOLETO `verifyHttpOnlyCookieAuth()` é dead code — remover |
| `F3-04`  | `RISCO` |  | **nao** | **nao** | — | 239 | `refreshAll` sem `AbortController` — race em `TOKEN_REFRESHED` consecutivo |
| `F3-05`  | `RISCO` |  | **nao** | **nao** | — | 242 | Parsing frágil de `role_permissions` — pode retornar `permissions = []` silenciosamente |
| `F3-06`  | `RISCO` |  | **nao** | **nao** | — | 245 | Realtime `zapp.profiles` só captura UPDATE — trocar para `event: '*'` |
| `F3-07`  | `RISCO` |  | **nao** | **nao** | — | 248 | `retryBootstrap()` pode empilhar `getSession()` sob `navigator.locks` |
| `F3-08` ⛔🔄 | `OBSOLETO` |  | **nao** | **nao** | R-CODE | 251 | OBSOLETO Deletar `externalSessionBridge.ts` — dead code ativo |
| `F3-09`  | `RISCO` |  | **nao** | **nao** | — | 256 | `signOut` sem fallback local se supabase-js falhar |
| `F3-10`  | `DEGRADADO` |  | **nao** | **nao** | — | 259 | `QuotaExceededError` silenciado em cookieStorage — CustomEvent + toast |
| `F3-11`  | `HIGIENE` |  | **nao** | **nao** | — | 262 | `markTimeToMainScreen` triplicado no ProtectedRoute — guard com `useRef` |
| `F3-12`  | `SEC` | 16 | **nao** | **nao** | — | 265 | `log_security_event` sem contexto (tenant/UA/IP) — enriquecer |
| `F4-01`  | `DEGRADADO` | 15 | sim | sim | — | 278 | `fetchConversations` sem cursor/paginação (500+1000 fixo) |
| `F4-02`  | `RISCO` |  | sim | sim | — | 286 | `fetchConversations` sem guard de mount para setState/commitConversations |
| `F4-03`  | `RISCO` |  | sim | sim | — | 294 | Channel realtime com nome aleatório (`Math.random()`) |
| `F4-04`  | `DEGRADADO` |  | sim | sim | — | 302 | `conversationSendState` computed fora de `useMemo` |
| `F4-05`  | `RISCO` |  | sim | sim | — | 310 | `USE_EXTERNAL_DB = true` hardcoded |
| `F4-06`  | `RISCO` |  | sim | sim | — | 318 | `handleSelectConversation` chama `evolution-api/read-messages` fire-and-forget |
| `F4-07`  | `RISCO` |  | sim | sim | — | 326 | Reconciliação de delivery limitada a `.slice(-10)` |
| `F4-08`  | `DEGRADADO` |  | sim | sim | — | 334 | `seededAvatarsRef` sem limpeza — memory leak |
| `F4-09`  | `HIGIENE` |  | sim | sim | — | 341 | `convProbeRef` log de debug em produção |
| `F4-10`  | `DEGRADADO` |  | sim | sim | — | 349 | `processedDeliveriesRef` (Set) cresce sem cap |
| `F4-11`  | `RISCO` |  | sim | sim | — | 357 | `localStorage.setItem` sem try/catch em useMessageQueue |
| `F4-12`  | `RISCO` |  | sim | sim | — | 365 | `beforeunload` handler ausente — cascade de sends no próximo load |
| `F4-13`  | `RISCO` | 15 | sim | sim | — | 372 | Classificação de erro sem diferenciar retryable |
| `F4-14`  | `RISCO` | 11 | sim | sim | — | 380 | `dbFrom('failed_messages').insert` falha silenciosa |
| `F4-15`  | `DEGRADADO` | 15 | sim | sim | — | 388 | `sendMessageToContact` faz 8 round-trips por mensagem |
| `F4-16`  | `RISCO` |  | sim | sim | — | 396 | `buildSendIdempotencyKeyFromFingerprint` 5min bucket colide |
| `F4-17`  | `RISCO` |  | sim | sim | — | 405 | `messageSender.audit_logs` fire-and-forget sem retry |
| `F4-18`  | `QUEBRADO` |  | sim | sim | R-FN | 413 | `retry_attempt` e `error_reason` 100% NULL em `messages` (bug de persistência) |
| `F4-19`  | `RISCO` |  | sim | sim | — | 426 | `extractEvolutionMessageId` pode retornar null; msgs sent sem external_id |
| `F4-20`  | `DEGRADADO` |  | sim | sim | — | 434 | `useMediaUrl.refreshCache` sem cap (potencial 100s MB) |
| `F4-21`  | `DEGRADADO` |  | sim | sim | — | 441 | `buildFileHash(originalUrl) != buildFileHash(dataUrl)` — cache DB nunca hit |
| `F4-22`  | `DEGRADADO` | 15 | sim | sim | — | 449 | `media_cache.storage_path` armazenando data URL base64 (anti-pattern) |
| `F4-23`  | `QUEBRADO` | 11 | sim | sim | R-CRON | 457 | Cron `retry-stuck-messages` opera em tabela vazia (`outbound_message_queue`) — 23 msgs pen |
| `F4-24` ⛔🔄 | `OBSOLETO` | 12 | sim | sim | R-CRON | 469 | OBSOLETO Cron `media_pipeline_health_check` (jobid 213) falha por schema drift |
| `F5-01`  | `QUEBRADO` | 6 | sim | sim | R-FN + R-VIEW | 496 | CRÍTICO (P0): view `zapp.contacts` descarta silenciosamente CPF, endereço, is_blocked/is_f |
| `F5-02`  | `QUEBRADO` | 6 | sim | sim | R-FN | 506 | CRÍTICO (P0): trigger UPDATE da view `zapp.contacts` dropa campos LGPD, soft-delete, works |
| `F5-03`  | `SEC` | 6 | sim | sim | R-FN | 519 | CRÍTICO (P0): trigger DELETE da view faz HARD DELETE — viola requisito LGPD de soft-delete |
| `F5-04`  | `QUEBRADO` | 7 | sim | sim | R-FN | 533 | CRÍTICO (P0): `zapp.merge_contacts()` LEVANTA EXCEPTION 'implementacao pendente (etapa 30) |
| `F5-05`  | `QUEBRADO` | 7 | sim | sim | R-DDL + R-FN + R-VIEW | 545 | CRÍTICO (P0): `bulk_soft_delete_contacts` referencia colunas `deleted_by`, `deleted_reason |
| `F5-06`  | `QUEBRADO` | 8 | sim | sim | R-DDL + R-FN + R-VIEW | 559 | CRÍTICO (P0): sem coluna CPF em `evo.evolution_contacts` e sem coluna CNPJ em lugar nenhum |
| `F5-07`  | `QUEBRADO` | 8 | sim | sim | R-FN | 572 | CRÍTICO (P0): sem `validate_cpf(text)` nem `validate_cnpj(text)` no banco — só `mask_cpf` |
| `F5-08`  | `RISCO` | 17 | sim | sim | — | 585 | CRÍTICO (P0): 5 estratégias diferentes de normalização de telefone — merge, search e intel |
| `F5-09`  | `QUEBRADO` | 7 | sim | sim | R-DDL + R-FN | 605 | CRÍTICO (P0): `add_contact_note` DESCARTA `p_note_type` e `p_is_pinned` silenciosamente —  |
| `F5-10`  | `SEC` | 7 | sim | sim | R-POL | 618 | CRÍTICO (P0): `useContactNotes.addNote` BYPASSA a RPC — INSERT direto na tabela contorna t |
| `F5-11`  | `QUEBRADO` | 7 | sim | sim | — | 631 | CRÍTICO (P0): `zapp.contact_notes` **VAZIA** em produção (0 rows) — feature 100% dead |
| `F5-12`  | `DEGRADADO` | 17 | sim | sim | — | 643 | CRÍTICO (P0): `search_contacts_cursor` NÃO usa `pg_trgm` — full scan em ILIKE |
| `F5-13`  | `SEC` | 17 | sim | sim | R-DDL | 654 | CRÍTICO (P0): `zapp.tags.name` UNIQUE global — cross-workspace conflict impossibilita mult |
| `F5-14` ⛔🔄 | `OBSOLETO` | 4 | sim | sim | R-POL | 666 | OBSOLETO CRÍTICO (P0): RLS `evo.evolution_contacts.contacts_insert` policy tem `WITH CHECK |
| `F5-15`  | `SEC` | 4 | sim | sim | R-POL | 678 | CRÍTICO (P0): RLS `contacts_select` expõe contatos `assigned_to IS NULL` a TODOS os usuári |
| `F5-16`  | `SEC` | 4 | sim | sim | R-POL + R-VIEW | 689 | CRÍTICO (P0): `get_default_workspace_id()` retorna workspace mais antigo — sem tenant isol |
| `F5-17`  | `RISCO` | 17 | sim | sim | — | 702 | `bulk_add_tag` sem cap de tamanho + sem visibility check por contato |
| `F5-18`  | `SEC` | 8 | sim | sim | — | 712 | `bulk_auto_merge_duplicates` seleção de primário sem regra LGPD explícita — pode migrar co |
| `F5-19`  | `QUEBRADO` | 17 | sim | sim | R-FN + R-VIEW | 723 | `get_contact_intelligence_by_phone` lê SÓ `evo.evolution_messages_wpp2` — multi-instância  |
| `F5-20`  | `SEC` | 4 | sim | sim | R-POL | 735 | `contacts_count_by_type` SECURITY DEFINER sem filtro por workspace — data leak agregado |
| `F5-21`  | `DEGRADADO` | 17 | sim | sim | — | 744 | `search_contacts_cursor` faz COUNT CTE em cada página — custo dobrado |
| `F5-22`  | `DEGRADADO` | 17 | sim | sim | — | 755 | `search_contacts_cursor` sem normalização de phone na busca — busca por telefone formatado |
| `F5-23`  | `DEGRADADO` | 17 | sim | sim | — | 766 | `search_contacts_cursor` só busca em `name`, `email`, `phone` — não busca em company, job_ |
| `F5-24`  | `DEGRADADO` | 17 | sim | sim | — | 776 | `useContactsSearch.pageIndexToCursor` sem deep-link support — jump-to-page-N via URL retor |
| `F5-25`  | `DEGRADADO` | 17 | sim | sim | — | 788 | `useContactNotes` N+1 query + sem pagination + sem edit mutation |
| `F5-26`  | `SEC` | 8 | sim | sim | R-FN | 799 | 20445 contatos, ZERO com `lgpd_consent_at` ou `lgpd_opt_out_at` set — compliance LGPD ause |
| `F5-27`  | `QUEBRADO` | 6 | sim | sim | R-FN | 812 | Trigger INSERT view assume individual (`@s.whatsapp.net`) — quebra suporte a grupos (`@g.u |
| `F5-28`  | `SEC` | 8 | sim | sim | R-FN | 823 | `rpc_get_contact` (4 overloads em `public` + `zapp`) expõe deals/messages/tasks de contato |
| `F5-29`  | `RISCO` | 6 | sim | sim | R-DDL | 835 | Sem FK/relação `zapp.contacts` ↔ `zapp.empresas` — Etapa 54 (validar FK cascade) é unmeeta |
| `F5-30`  | `HIGIENE` | 7 | sim | sim | R-CODE | 846 | `zapp.tags` schema mistura AI tag suggestions com canonical tags — dupla responsabilidade |
| `F6-01`  | `QUEBRADO` | 14 | sim | sim | — | 866 | CRÍTICO (P0): pairing code (Etapa 58) 100% AUSENTE do código |
| `F6-02`  | `QUEBRADO` | 14 | sim | sim | — | 877 | CRÍTICO (P0): `handleAddConnection` NÃO chama Evolution `/instance/create` — só INSERT no  |
| `F6-03`  | `QUEBRADO` | 14 | sim | sim | R-VIEW | 889 | CRÍTICO (P0): estado divergente wpp2 entre `zapp.whatsapp_connections` e `evo.evolution_in |
| `F6-04`  | `RISCO` | 14 | sim | sim | — | 907 | CRÍTICO (P0): 2 fontes de verdade para instância (whatsapp_connections vs evolution_instan |
| `F6-05`  | `QUEBRADO` | 14 | sim | sim | R-FN | 919 | CRÍTICO (P0): `fn_reconcile_dispatch` reutiliza `request_id` do net_worker → 373 rows (22% |
| `F6-06`  | `RISCO` | 14 | sim | sim | R-FN | 931 | CRÍTICO (P0): `fn_alert_wpp2_disconnection` hardcoded para instance_name='wpp2' — não esca |
| `F6-07`  | `RISCO` | 5 | sim | sim | R-POL | 945 | `fn_alert_wpp2_disconnection` NÃO é SECURITY DEFINER — inconsistente com pattern das outra |
| `F6-08`  | `DEGRADADO` | 9 | sim | sim | R-FN | 956 | CRÍTICO (P0): 17 de 18 alerts `wpp2_disconnection` nunca resolvidos (94% backlog) — alert  |
| `F6-09`  | `RISCO` | 12 | sim | sim | R-CRON | 968 | CRÍTICO (P0): cron `wpp2_disconnection_watchdog` (104) schedule `*/10 6-23 * * *` — 6h gap |
| `F6-10` ⛔🔄 | `OBSOLETO` | 12 | sim | sim | R-CRON | 980 | OBSOLETO cron `sync-instance-registry-status` (96) perdeu 11% das execuções em 24h (256/28 |
| `F6-11`  | `RISCO` | 14 | sim | sim | R-FN | 993 | 6 triggers em `zapp.whatsapp_connections`; 4 são duplicatas divergentes (2 pares) |
| `F6-12`  | `SEC` | 14 | sim | sim | R-FN | 1009 | `fn_validate_whatsapp_connection_url` cai para hardcoded default se vault vazio — não fail |
| `F6-13`  | `RISCO` | 14 | sim | sim | R-DDL | 1020 | CRÍTICO (P0): `api_url` e `api_key` são NOT NULL sem default — INSERT via `useConnectionsA |
| `F6-14`  | `HIGIENE` | 14 | sim | sim | — | 1033 | Só 1 registro em `evo.evolution_instance_credentials` (wpp2); 2 conexões em `whatsapp_conn |
| `F6-15`  | `HIGIENE` | 14 | sim | sim | — | 1045 | "WPP Marketing (Cloud API Oficial)" tem `api_type='evolution'` — nome enganoso vs config r |
| `F6-16`  | `SEC` | 14 | sim | sim | R-FN | 1057 | CRÍTICO (P0): `created_by = NULL` em 3/3 rows de `whatsapp_connections` — ownership perdid |
| `F6-17`  | `SEC` | 4 | sim | sim | R-POL | 1070 | CRÍTICO (P0): RLS `wconn_insert_auth` policy `WITH CHECK (created_by IS NULL OR created_by |
| `F6-18`  | `SEC` | 5 | sim | sim | R-POL | 1081 | Policy `auth_secure_123` (nome de código de teste) em produção |
| `F6-19`  | `QUEBRADO` | 14 | sim | sim | — | 1090 | CRÍTICO (P0): `evo.evolution_ip_watch` = 0 rows total — pipeline VPS→DB de detecção 401 mo |
| `F6-20`  | `QUEBRADO` | 14 | sim | sim | — | 1100 | CRÍTICO (P0): `fn_detect_401_bursts` documenta seu próprio "monitoring gap" no comentário  |
| `F6-21`  | `QUEBRADO` | 14 | sim | sim | R-FN | 1111 | CRÍTICO (P0): 373 reconcile_jobs (22%) com `applied_at < dispatched_at - 1 day` — telemetr |
| `F6-22`  | `DEGRADADO` | 9 | sim | sim | — | 1124 | 1389 alertas em `zapp.warroom_alerts` em 7d (863 info + 385 critical + 141 warning) — aler |
| `F6-23`  | `DEGRADADO` | 9 | sim | sim | — | 1136 | `evo.evolution_alerts` 269 unresolved backlog — nenhum triage |
| `F6-24`  | `HIGIENE` | 14 | sim | sim | — | 1148 | `zapp.instance_registry` tem 22 rows; só 3 provisionadas (14%) |
| `F6-25`  | `QUEBRADO` | 14 | sim | sim | R-FN | 1161 | `instance_auth_events` últimas 17 rows com `event_type=NULL`, `http_status=NULL`, `success |
| `F6-26`  | `HIGIENE` | 2 | sim | sim | — | 1174 | Test coverage módulo connections: 2 test files para ~30 arquivos (0 tests em componentes) |
| `F6-27`  | `SEC` | 4 | sim | sim | R-POL | 1194 | CRÍTICO (P0): `useEvolutionAutoSync` faz SELECT sem filtro por workspace/user — cross-tena |
| `F6-28`  | `RISCO` | 14 | sim | sim | — | 1206 | `handleDelete` engole erro do Evolution API `.catch(log.warn)` — deixa instância órfã lá |
| `F6-29`  | `RISCO` | 14 | sim | sim | — | 1218 | `handleAddConnection` valida só `name` — permite `phone_number` vazio |
| `F6-30`  | `HIGIENE` | 14 | sim | sim | R-DDL | 1228 | Múltiplas cópias de tabelas em múltiplos schemas: 13 objetos para 5 nomes distintos |
| `F7-01`  | `HIGIENE` | 18 | sim | sim | — | 1252 | `PerformanceDashboard.tsx` renderiza `// @technical` como texto literal em 3 blocos JSX |
| `F7-02`  | `HIGIENE` |  | sim | sim | — | 1264 | `AdminBridgeStatusPage.tsx` mesmo bug após `</p>` |
| `F7-03`  | `HIGIENE` |  | sim | sim | — | 1273 | `AdminEmailAuditPage.tsx` `// @technical` dentro do children de `<Badge>` |
| `F7-04`  | `QUEBRADO` |  | sim | sim | — | 1282 | `AdminBridgeStatusPage.tsx` latência 42ms e uptime 99.9% hardcoded |
| `F7-05`  | `QUEBRADO` |  | sim | sim | R-CODE | 1293 | `AuditEvidenceDashboard.tsx` página inteira MOCK ESTÁTICO |
| `F7-06`  | `HIGIENE` |  | sim | sim | — | 1306 | `setLastLastUpdate` (typo) |
| `F7-07`  | `DEGRADADO` |  | sim | sim | — | 1314 | Normalização de progress bar hardcoded a 4000 para todas as métricas Web Vitals |
| `F7-08`  | `DEGRADADO` |  | sim | sim | — | 1325 | Polling 500x/hora sem `document.visibilityState` |
| `F7-09`  | `QUEBRADO` |  | sim | sim | — | 1336 | Rota `/admin/webhook-overview` inexistente |
| `F7-10`  | `QUEBRADO` |  | sim | sim | R-DDL | 1347 | `AdminChannelsPage.tsx` `color: "bg-primary"` usado como inline style `backgroundColor` |
| `F7-11`  | `QUEBRADO` |  | sim | sim | — | 1360 | `zapp.provider_message_log` = 0 rows total |
| `F7-12`  | `SEC` |  | sim | sim | — | 1371 | `AdminSecurityLogsPage` KPI "Tentativas Negadas (24h)" mente sobre janela |
| `F7-13`  | `QUEBRADO` | 18 | sim | sim | R-CODE | 1385 | Painel Rate Limiting inteiro sempre em zero |
| `F7-14`  | `DEGRADADO` | 9 | sim | sim | R-CRON + R-FN | 1398 | `webhook_health_alerts` 724 unresolved (98.6% backlog); sistema pede "não vá pra prod" |
| `F7-15` ⛔🔄 | `OBSOLETO` | 12 | sim | sim | R-CRON + R-FN | 1411 | OBSOLETO Cron 213 `media_pipeline_health_check` 42.8% falha |
| `F7-16` ⛔🔄 | `OBSOLETO` | 10 | sim | sim | R-CRON | 1426 | OBSOLETO Cron 100 `analytics-log-retention` 100% falha (`dblink` não instalada) |
| `F7-17`  | `SEC` | 8 | sim | sim | — | 1439 | `remote_jid` completo em URL query (PII em logs) |
| `F7-18`  | `QUEBRADO` | 18 | sim | sim | — | 1450 | `hmac_selftest_audit` = 0 rows |
| `F7-19`  | `RISCO` |  | sim | sim | — | 1461 | `STATUS_BADGE[ch.status]` sem defensive fallback |
| `F7-20`  | `QUEBRADO` |  | sim | sim | — | 1469 | `automation_executions` = 0 rows |
| `F7-21` ⛔🔄 | `OBSOLETO` |  | sim | sim | — | 1480 | OBSOLETO `HmacSelfTestPage` useEffect com dependência `[run]` — risco de loop infinito |
| `F7-22`  | `RISCO` |  | sim | sim | — | 1492 | Botão "Run test suite" sem confirmação; label hardcoded "50 testes" |
| `F7-23`  | `RISCO` |  | sim | sim | — | 1503 | Decisão de variant baseada em `overall?.includes('🟢')` (contrato frágil) |
| `F7-24`  | `RISCO` |  | sim | sim | — | 1515 | `AdminWhatsAppWebhookVerifyCard.tsx` chave React duplicável |
| `F7-25`  | `QUEBRADO` |  | sim | sim | — | 1523 | Cloud API webhook sem tráfego há 90 dias |
| `F7-26`  | `HIGIENE` |  | sim | sim | — | 1535 | `AdminQueuesPage` helper `NOT_IMPLEMENTED` em produção |
| `F7-27`  | `QUEBRADO` |  | sim | sim | R-CRON | 1545 | `AdminProvidersPage` promete "health-check 2min" mas `provider_configs` vazia |
| `F7-28`  | `SEC` |  | sim | sim | R-POL | 1557 | `AdminSecurityLogsPage` comentário TODO em prod, filtro sem janela |
| `F7-29`  | `RISCO` |  | sim | sim | — | 1570 | `AdminFailedAuthMessagesPage` sem validação `from > to` nem timezone |
| `F7-30`  | `QUEBRADO` |  | sim | sim | — | 1581 | `AdminEmailStatusPage` usa `location.hash =` em app path-based |
| `F7-31`  | `RISCO` |  | sim | sim | — | 1589 | `SelfHostedHealthPage` sem AbortController + results stale em erro |
| `F7-32` ⛔🔄 | `OBSOLETO` | 18 | sim | sim | — | 1599 | OBSOLETO `AdminAutomationLogsPage` paginação 0-indexed inconsistente |
| `F8-01` ⛔🔄 | `OBSOLETO` | 13 | sim | sim | R-CODE | 1618 | OBSOLETO CRÍTICO (P0): página `SLAAlertPreferences.tsx` órfã — 215 linhas de UI inalcançáv |
| `F8-02`  | `QUEBRADO` | 13 | sim | sim | R-CRON + R-DDL | 1632 | CRÍTICO (P0): schema `bpm` inteiro morto — 41 tabelas com 0 rows, zero funções, zero views |
| `F8-03`  | `RISCO` | 13 | sim | sim | — | 1646 | CRÍTICO (P0): 3+ sistemas SLA paralelos sem canonical |
| `F8-04`  | `QUEBRADO` | 13 | sim | sim | R-FN | 1664 | CRÍTICO (P0): triggers `zapp.bpm_track_sla()` e `bpm_track_sla_on_create()` são stubs vazi |
| `F8-05`  | `QUEBRADO` | 12 | sim | sim | R-CRON + R-FN | 1678 | CRÍTICO (P0): cron 198 chama função no-op (`bpm_check_breached_slas`); a versão completa ( |
| `F8-06`  | `SEC` | 4 | sim | sim | R-POL | 1691 | CRÍTICO (P0): RLS de todas as 41 tabelas `bpm.*` é `USING(true) WITH CHECK(true)` para `au |
| `F8-07`  | `QUEBRADO` | 13 | sim | sim | — | 1704 | CRÍTICO (P0): `useSLAMetrics.overallRate` fallback = 100 mascara dashboard vazio |
| `F8-08`  | `QUEBRADO` | 13 | sim | sim | R-VIEW | 1714 | CRÍTICO (P0): `zapp.queues` = 0 rows → `rpc_queue_sla_panel` sempre retorna vazio; comentá |
| `F8-09`  | `QUEBRADO` | 12 | sim | sim | R-CRON | 1728 | CRÍTICO (P0): `evo.evolution_health_logs` vazia → cron 163 (`evo-peak-hours-sla`) retorna  |
| `F8-10` ⛔🔄 | `OBSOLETO` | 20 | sim | **nao** | R-CODE | 1741 | OBSOLETO MÉDIO (P1): `src/pages/SLADashboard.tsx` (22 linhas) é wrapper dead code |
| `F8-11`  | `HIGIENE` | 5 | sim | sim | R-POL | 1753 | MÉDIO (P1): `zapp.sla_alert_preferences` tem policy redundante — `users_own_preferences` é |
| `F8-12`  | `HIGIENE` | 20 | sim | sim | R-CODE | 1768 | BAIXO (P1): `src/hooks/useSLAHistory.ts` é re-export duplicado (2 linhas) |
| `F8-13`  | `HIGIENE` | 13 | sim | sim | R-DDL | 1781 | BAIXO (P1): smoke test data ("F4 SLA", "E2 Race") vazando em produção há 3 meses |
| `F8-14`  | `QUEBRADO` | 12 | sim | sim | R-CRON | 1792 | MÉDIO (P1): cron 205 (`verify-alert-delivery-10min`) não cobre alertas SLA — premissa da e |
| `F8-15`  | `DEGRADADO` | 12 | sim | sim | R-DDL | 1804 | MÉDIO (P1): `bpm.bpm_sla_records` só tem `pkey` — sem índice em `deadline_at, exited_at, i |
| `F8-16`  | `RISCO` | 9 | sim | sim | R-CRON | 1816 | MÉDIO (P1): histórico documentado de blackout de notificação em 31/07/2026 18:40 UTC — 14  |
| `F8-17`  | `RISCO` | 5 | sim | sim | R-FN + R-VIEW | 1828 | MÉDIO (P1): `zapp.fn_check_all_cards_sla` tem `search_path` sem `bpm` — resolução implícit |
| `F9-01`  | `HIGIENE` | 13 | sim | sim | R-CODE | 1854 | ALTO (P0): `src/lib/offlineQueue.ts` (226 linhas) não tem um único consumidor em produção  |
| `F9-02`  | `QUEBRADO` | 13 | sim | sim | — | 1871 | ALTO (P0): `sendQueuedMessages()` no Service Worker é stub de `console.log` e a tag de syn |
| `F9-03`  | `QUEBRADO` | 13 | sim | sim | — | 1891 | MÉDIO (P1): `index.html` desregistra todos os Service Workers na primeira visita de cada s |
| `F9-04`  | `RISCO` | 19 | sim | sim | — | 1906 | MÉDIO (P1): cliente supabase-js criado sem qualquer política de retry — falha de rede tran |
| `F9-05`  | `HIGIENE` | 19 | sim | sim | R-CODE | 1921 | BAIXO (P1): quatro implementações paralelas de backoff exponencial coexistem (1.266 linhas |
| `F9-06`  | `DEGRADADO` | 19 | sim | sim | — | 1937 | MÉDIO (P1): não existe indicador de perda de conectividade de rede/Supabase — o único "sta |
| `F9-07`  | `DEGRADADO` | 9 | sim | sim | R-FN | 1952 | CRÍTICO (P0): guard de deduplicação de `fn_detect_401_bursts` filtra o campo errado — 96 a |
| `F9-08`  | `DEGRADADO` | 9 | sim | sim | R-CRON | 1977 | MÉDIO (P1): `zapp.warroom_alerts` não tem política de retenção e acumula desde 2026-05-12 |
| `F9-09`  | `QUEBRADO` | 11 | sim | sim | R-CRON | 1993 | ALTO (P0): o roteador de DLQ exclui explicitamente a partição viva (`_v2_%`) e opera apena |
| `F9-10`  | `QUEBRADO` | 11 | sim | sim | R-FN | 2018 | MÉDIO (P1): `fn_monitor_dlq_health` "resolve" alertas sem alterar os booleanos do WHERE —  |
| `F9-11`  | `RISCO` | 11 | sim | sim | R-POL | 2042 | MÉDIO (P1): `fn_flag_poison_messages` engole silenciosamente a falha do alerta — mensagens |
| `F9-12`  | `QUEBRADO` | 10 | sim | sim | R-CRON + R-FN | 2079 | CRÍTICO (P0): o deadman switch do guardian é auto-alimentado por um cron — nunca poderá di |
| `F9-13`  | `QUEBRADO` | 10 | sim | sim | R-CRON + R-FN | 2101 | ALTO (P0): `fn_sync_guardian_heartbeat` quebrada há 7+ dias por `search_path` sem `zapp`,  |
| `F9-14`  | `RISCO` | 10 | sim | sim | R-FN | 2124 | MÉDIO (P1): a "resiliência" do heartbeat é ilusória — os dois destinos são a mesma tabela  |
| `F9-15`  | `HIGIENE` | 11 | sim | sim | R-DDL | 2141 | MÉDIO (P1): `idempotency_key` é 100% NULL em 108.894 linhas, mantendo um índice único sem  |
| `F9-16` 🔄 | `SEC` | 3 | sim | sim | — | 2157 | CRÍTICO (P0): tokens JWT configurados com validade de 365 dias [REVISADO 2026-08-02] |
| `F9-17` 🔄 | `SEC` | 3 | sim | sim | R-POL | 2183 | ALTO (P0): `jwt_secret` persistido em texto claro no catálogo, legível por `anon` e `authe |
| `F9-18` 🔄 | `DEGRADADO` | 3 | sim | sim | — | 2213 | MÉDIO (P1): `authenticated` tem `statement_timeout` de 120s, 4× o padrão do cluster — uma  |
| `F9-19`  | `RISCO` | 19 | sim | sim | — | 2233 | MÉDIO (P1): três circuit breakers independentes para a mesma Evolution API, com limiares d |
| `F10-01`  | `HIGIENE` | 19 | sim | sim | — | 2263 | ALTO (P0): a suíte cross-browser cobre apenas Chromium — Safari, Firefox, Edge e mobile nã |
| `F10-02`  | `HIGIENE` | 2 | sim | sim | — | 2280 | ALTO (P0): 28 dos 61 testes E2E nunca são executados por nenhum workflow |
| `F10-03`  | `HIGIENE` | 13 | sim | sim | R-CODE | 2300 | MÉDIO (P1): `vite-plugin-pwa` é dependência fantasma — declarada, instalada, nunca importa |
| `F10-04`  | `HIGIENE` | 2 | sim | sim | — | 2319 | MÉDIO (P1): `@storybook/addon-a11y` instalado mas não registrado — o contraste WCAG nunca  |
| `F10-05`  | `HIGIENE` | 2 | sim | sim | — | 2344 | ALTO (P0): a verificação de acessibilidade cobre só 3 telas de autenticação — o produto in |
| `F10-06`  | `QUEBRADO` | 2 | sim | sim | — | 2368 | MÉDIO (P1): o gate de performance roda com `continue-on-error: true` — nunca reprova nada |
| `F10-07`  | `HIGIENE` | 19 | sim | sim | — | 2394 | MÉDIO (P1): Lighthouse não existe no repositório, embora a etapa 100 o exija |
| `F10-08`  | `HIGIENE` | 13 | sim | sim | — | 2409 | MÉDIO (P1): impressão está globalmente bloqueada — a etapa 99 pede transcript imprimível e |
| `F10-09`  | `HIGIENE` | 2 | sim | sim | — | 2428 | BAIXO (P1): três configs Playwright com `testDir` divergentes — `test:e2e` aponta para o d |

---

Resumo: 200 achados · 189 ativos · 11 obsoletos · 142 alocados em etapa · 55 ativos sem etapa.
