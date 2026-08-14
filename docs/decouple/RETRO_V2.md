# Retrospectiva — Plano V2 de Desacoplamento (zapp-web-v3)

> Retrospectiva da execução do plano V2 de desacoplamento Evolution→ZAPP (adm01-debug).
> Fonte: medições reais das auditorias W1–W8. Itens sem medição estão marcados como
> **não medido**. Tom honesto: o V2 entregou muito, mas deixou pendências estruturais.

## 1. Dados medidos reais da execução

| Métrica | Valor medido |
|---|---|
| Tabelas migradas evo→zapp | 74 |
| Tabelas Grupo A que permanecem em evo | 27 |
| Gate ownership (pendentes / migrados / críticos) | 0 / 37 / 0 |
| Health score | 100.0 (A+) |
| Mensagens processadas / 24h | 5.077 |
| DLQ (dead-letter queue) | 0 |
| Inventory final | 0/0/0 |
| Edge fns lendo `EVOLUTION_API_URL` direto | 17 → reduzido a 1 gateway (`client.ts`, 11 verbos) |
| Fns SQL chamando Evolution | 5 → 2 resolvers (`ops.fn_evo_url` / `ops.fn_evo_key`) |
| F3 frontend | `whatsappAdapter` com transports `evolution`/`cloud` |
| RPCs de ingestão | `rpc_claim_outbound_message` + `rpc_update_incoming_message` |
| [H2] REVOKE Grupo A — grants de escrita `authenticated` | 0 |
| `rpc_upsert_contact` | consolidado em 1 overload (14 args) |

## 2. O que funcionou (com números)

- **Migração de dados em escala**: 74 tabelas migradas evo→zapp, com gate ownership
  zerado (0 pendentes / 37 migrados / 0 críticos). O critério de ownership funcionou
  como trava objetiva de conclusão.
- **Saúde do sistema**: health score 100.0 (A+) ao final — o desacoplamento não
  degradou a plataforma.
- **Produção estável sob carga**: 5.077 msgs/24h com DLQ 0. Nenhuma mensagem perdida
  ou retida durante a janela medida.
- **Superfície de acesso a Evolution drasticamente reduzida**: 17 edge fns lendo
  `EVOLUTION_API_URL` direto viraram 1 gateway único (`client.ts`, 11 verbos). O ponto
  de troca de provider no backend ficou único e auditável.
- **SQL desacoplado de Evolution**: 5 fns SQL chamando a API viraram 2 resolvers
  (`ops.fn_evo_url` / `ops.fn_evo_key`), centralizando URL/chave em uma só camada.
- **Frontend preparado**: `whatsappAdapter` com transports `evolution`/`cloud` —
  o F3 entregou a abstração de transporte no cliente.
- **Ingestão via RPCs**: `rpc_claim_outbound_message` + `rpc_update_incoming_message`
  consolidaram o fluxo de mensagens em contratos explícitos.
- **[H2] REVOKE Grupo A efetivo**: 0 grants de escrita `authenticated` restantes —
  a superfície de escrita do Grupo A foi fechada de fato.
- **Contratos simplificados**: `rpc_upsert_contact` consolidado em 1 overload
  (14 args), eliminando ambiguidade de assinaturas.

## 3. O que não funcionou ou ficou pendente

- **ADR-008 é stub**: a decisão arquitetural que deveria registrar o desacoplamento
  não foi escrita. Documentação de decisão em aberto.
- **RUNBOOK_TROCA_PROVIDER não existia**: o runbook de troca de provider — peça
  central do V2 — nunca foi criado. Sem ele, a troca real é insegura.
- **Ensaio de troca de provider: não medido** — nunca foi executado nem medido.
  A capacidade de trocar provider segue teórica, não comprovada.
- **`decouple-guard.yml` com threshold 15 (frouxo)**: o guard permitia até 15
  ocorrências antes de falhar; na prática não impede regressão pontual.
- **Vault com 10 secrets `evolution_*`**, sendo 2 pares duplicados — risco de
  rotação parcial e confusão de qual valor é o vigente.
- **G4: guardian/pgbackrest fora de stack** — componentes de resiliência/backup
  não integrados à stack, fora do escopo de governança do desacoplamento.
- **ESLint decouple em `warn`**: regras de desacoplamento não falham o build;
  regressão pode entrar silenciosamente.
- **Branches zumbis**: branches antigas sem merge/close aumentam ruído e risco de
  merge acidental de código desacoplado.

## 4. Lições

- **Métricas zeradas não provam capacidade de troca**: gate 0/37/0 e health 100.0
  mostram estado estático bom, mas nada mediu a operação de troca em si. "Está
  desacoplado" só se prova com o ensaio.
- **Guard com threshold alto é guard de fachada**: threshold 15 permite que o
  desacoplamento regrida em lotes sem alertar. Guard precisa refletir o objetivo
  (idealmente 0 ou 1).
- **Runbook antes do ensaio, ensaio antes do deploy**: a ordem correta é
  ADR → runbook → ensaio → medição. O V2 pulou os três primeiros passos na prática.
- **Segredo duplicado é dívida operacional**: 10 secrets com 2 pares duplicados
  transformam rotação em caça ao tesouro; deduplicar é pré-requisito de rotação segura.
- **Warn não protege**: lint de desacoplamento em `warn` documenta intenção, não
  garante nada. O que não falha o CI não é contrato.

## 5. Encaminhamento para o V3

1. **Escrever o ADR-008** completo (decisão de desacoplamento, escopo, não-objetivos).
2. **Criar o RUNBOOK_TROCA_PROVIDER** e executar o **ensaio de troca de provider**
   medido (hoje: não medido) — critério de aceite do V3.
3. **Apertar o `decouple-guard.yml`**: reduzir threshold 15 → 0/1 e tornar falha
   obrigatória no CI.
4. **Limpar o vault**: eliminar os 2 pares de secrets `evolution_*` duplicados
   (10 → 6 ou menos) e marcar o par vigente.
5. **Integrar G4**: trazer guardian/pgbackrest para dentro da stack e do escopo
   de governança.
6. **Promover ESLint decouple de `warn` para `error`** no build.
7. **Podar branches zumbis** e revisar política de fechamento.
8. **Decidir o destino das 27 tabelas Grupo A** que permanecem em evo: migrar,
   manter com justificativa registrada ou descontinuar — com ADR próprio.

---

*Fim da retrospectiva V2. Próximo marco: V3 com ensaio de troca de provider medido.*
