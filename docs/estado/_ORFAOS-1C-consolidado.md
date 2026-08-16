# Orfaos do Bloco 1C — consolidacao e triagem de remocao

> Fonte: secoes de orfaos das saidas docs/estado/13 a 22.
> Gerado 2026-08-09. Runtime dos componentes: NAO_VERIFICADO (analise estatica de import).

## Resumo

Os batches marcaram **~189 arquivos como ORFAO** (sem importador fora do proprio diretorio).
**Orfao != codigo morto.** A leitura das saidas mostra que a esmagadora maioria e
**encapsulamento de modulo** (facade pattern): um ponto de entrada unico (ex.
`ContactsRichView`, `OmnichannelManager`) importa os demais, entao eles nao tem importador
"externo" mas estao vivos e em uso.

O grep dos subagentes foi **repo-wide** (`grep -rl Nome src/ supabase/ scripts/`), entao
referencia estatica cross-modulo e dynamic-import-por-path (onde o nome do arquivo aparece
no path) **ja foram capturados**. O residuo de risco real e estreito: arquivos cujo nome
de export difere do nome do arquivo E que so sao referenciados dinamicamente.

## Triagem dos que JA tem veredito nas saidas (15, 18, 21)

Dos orfaos com veredito explicito de remocao, **apenas 7 sao acionaveis**; os outros 48
sao SEGURO (encapsulamento interno legitimo).

### VERIFICAR (4) — baixa adocao / possivel duplicata

| arquivo | linhas | motivo |
|---|---|---|
| `ContactKanbanView.tsx` | 207 | Colunas hardcoded; usa `dbFrom` nao-padrao; sem adocao externa |
| `ContactMapView.tsx` | 269 | Nome enganoso (sem mapa real); implementacao PARCIAL; candidato a renomear |
| `ContactsTableVirtual.tsx` | 376 | Alternativa virtualizada de baixa adocao; manutencao dupla com `ContactsTable` |
| `omnichannel/ChannelRoutingRules.tsx` | 118 | Lazy por `OmnichannelManager`; `AdminQueuesPage` so tem referencia em comentario, nao import real |

### NAO_REMOVER (3) — papel de infra ou fix pendente

| arquivo | linhas | motivo |
|---|---|---|
| `ContactMergeDialog.tsx` | 426 | Merge sem transacao atomica (achado A1) — precisa de fix, nao remocao |
| `routing/AdminRoutes.tsx` | 291 | Infra de rotas; exporta funcao (nao componente) usada por `AppRoutes` |
| `routing/DebugRoutes.tsx` | 53 | Infra de rotas `/debug/*`; guard admin/dev |

Nota sobre `ChannelRoutingRules.tsx`: liga direto ao achado das issues #1000/#1001 — a UI de
regras de roteamento existe mas `zapp.channel_routing_rules` tem **0 linhas** em runtime
(subsistema de fila dormente). Coerente com "baixa adocao".

## Pendente: classificacao dos ORFAO-only-tagged (~122+ arquivos)

A maioria dos orfaos esta marcada so como tag `ORFAO` na tabela de arquivos (saidas 15,16,
17,18,19,21 principalmente), **sem veredito de remocao**. Lista extraida em
`/tmp/orfao-files.json` (122 arquivos por regex; +~67 em 13/14/20/22 cujo formato de tag o
regex nao pegou). Classificar cada um em REMOVIVEL_SEGURO / USADO_INTERNO (facade) /
USADO_DINAMICO (lazy/rota) / NAO_REMOVER exige leitura por-arquivo com re-check de
alcancabilidade (barrel re-export + se o barrel e importado; strings de lazy/rota). E job
delegado proprio — nao rodado junto com o 1D para nao sobrecarregar o container.
