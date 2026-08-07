# MCP_QUERY_SECRET — Procedimento de Rotação (P1)

> **Status:** PROCEDIMENTO APROVADO — rotação **NÃO executada** (aguarda merge da branch e execução via Portainer MCP pelo orquestrador).
> **Data:** 2026-08-07 · **Branch:** `fix/fin-a6-secret-rot-f9160`
> **Severidade:** P1 (valor atual == valor vazado em repo **público**)

---

## 1. Contexto (por que rotacionar)

- A edge function `mcp-query` (MCP interno de SQL read-only) nasceu com o secret **hardcoded no source** (`'zappweb_mcp_...'`), que vazou no histórico de um repositório **público**.
- Onda #964 (commit `f1e18bc84`, `security(mcp-query)`) removeu o hardcode: a função agora lê exclusivamente de `Deno.env.get("MCP_QUERY_SECRET")` (fail-closed: sem env → **503**; header errado/ausente → **401**).
- O valor **atual** do secret docker (`mcp_query_secret_v1`, montado no serviço `supabase_functions`) **ainda é o valor vazado** → rotação pendente.
- Comportamento fail-closed por design: **não há dual-secret** — o validador aceita apenas o valor presente na env. A rotação implica **janela de quebra** para o consumidor externo (ver §5).

---

## 2. Inventário de consumidores (varredura final — 2026-08-07)

Varredura `grep -rniE 'x-mcp-secret|mcp-query|MCP_QUERY_SECRET'` em `src/`, `docs/`, `.github/`, `infra/`, `supabase/` (e repo inteiro, excluindo `node_modules/.git/dist`).

### 2.1 Consome o **valor** do secret

| Arquivo | Papel | Detalhe |
|---|---|---|
| `supabase/functions/mcp-query/index.ts` | **Validador** (único no runtime) | `const SECRET = Deno.env.get("MCP_QUERY_SECRET") ?? ""` (L13); compara com header `x-mcp-secret` (L23) → 401; sem env → 503 (fail-closed). CORS permite o header (L3). |

### 2.2 Referências **sem** consumo de valor (declarações, contratos, comentários, testes)

| Arquivo | Tipo |
|---|---|
| `supabase/functions/.env.required:9` | Declaração de env exigida no deploy (nome apenas, sem valor) |
| `supabase/functions/_shared/contract-schemas-infra.ts:296` | Comentário de contrato `mcp-query@v1` |
| `supabase/functions/_shared/contract-schemas.ts:923` | Registro de schema de contrato (sem secret) |
| `supabase/functions/_shared/contract-versions.ts:120` | Registro de versão de contrato |
| `supabase/functions/_shared/edge-contract-schemas.ts:108` | Lista de nomes de contratos |
| `supabase/migrations/20260808130000_exec_sql_mcp_query_rpc.sql` | Comentário (contexto da RPC `exec_sql` usada pela função) |
| `infra/edge-deploy/deploy-edge.sh:247` | Comentário sobre `CONTRACT_SCHEMAS` |
| `supabase/functions/mcp-query/__tests__/contract.test.ts` | Testes: assert de que o secret **não** está hardcoded (L61-68) |

### 2.3 Consumidor externo (fora do repo)

- **Worker MCP da casa** — envia o header `x-mcp-secret` nas chamadas a `mcp-query`. **Não identificado no repo** (0 hits fora do `mcp-query`), nem o valor, nem o client. Deve ser atualizado manualmente na janela de rotação (§5).
- **Resultado da varredura:** nenhum outro consumidor do valor no repo. Os únicos hits são a própria função, declarações/comentários e testes.

---

## 3. Pré-flight (obrigatório antes de executar)

Rodar no host do Swarm (via Portainer MCP: exec em `docker-housekeeping_cleanup` ou direto no host).

1. **Descobrir o wiring real da env** — como `MCP_QUERY_SECRET` é injetada no `supabase_functions`:
   ```bash
   docker service inspect supabase_functions --format '{{.Spec.Name}}|ARGS={{.Spec.TaskTemplate.ContainerSpec.Args}}|SECRETS={{range .Spec.TaskTemplate.ContainerSpec.Secrets}}{{.SecretName}}->{{.File.Name}};{{end}}'
   ```
   Decisão crítica (§4c): se o `Args`/entrypoint exporta `MCP_QUERY_SECRET=$(cat /run/secrets/mcp_query_secret_v1)`, o path do arquivo é `mcp_query_secret_v1`.
2. **Backup do stack file** (fonte da verdade do Swarm):
   ```bash
   # portainer_get_stack_file do stack que declara supabase_functions → backup-stack<NN>-<data>-orig.yaml
   ```
3. **Fingerprint do valor atual** (nunca imprimir o valor cru):
   ```bash
   docker exec <container-supabase_functions> sh -c 'printf %s "$(cat /run/secrets/mcp_query_secret_v1)" | sha256sum | cut -c1-12'
   ```
   Registrar o fp ANTES (para diff pós-rotação).
4. **Confirmar URL pública da função** (base do Supabase self-hosted, padrão Kong):
   `https://supabase.atomicabr.com.br/functions/v1/mcp-query` (ajustar se o host for outro).
5. **Coordenar janela** com o dono do worker MCP da casa (o orquestrador). Horário de baixo uso; janela alvo: **minutos**.
6. `docker secret ls` — confirmar que `mcp_query_secret_v1` existe e que **não existe** `mcp_query_secret_v2` (evitar colisão).

---

## 4. Procedimento de rotação (ordem exata)

### (a) Gerar novo valor

```bash
openssl rand -hex 24
# 48 caracteres hex. Alternativa: python3 -c "import secrets; print(secrets.token_hex(24))"
```
> ⚠️ O valor gerado **nunca** deve ser commitado, impresso em relatório ou enviado por chat. Só fingerprints (`sha256` 12 chars) em artefatos.

### (b) Criar o secret **v2** (imutável — padrão da casa `_vN`)

```bash
printf '%s' '<NOVO_VALOR>' | docker secret create mcp_query_secret_v2 -
# saída: ID do secret (não é o valor). Confirmar fp:
printf '%s' '<NOVO_VALOR>' | sha256sum | cut -c1-12   # registrar como FP_NOVO
```
> **NUNCA** tentar `docker secret rm mcp_query_secret_v1 && docker secret create mcp_query_secret_v1 -`:
> o `rm` **falha** porque `supabase_functions` (e possivelmente outros serviços) monta o secret — `Error response from daemon: rpc error: ... secret is in use`. Secrets são imutáveis; a rotação se dá por **nova versão + re-apontamento** (permite rollback sem recriar valor).

### (c) Re-apontar o stack file para `mcp_query_secret_v2`

**Fonte da verdade = stack file do Portainer.** Editar o compose do stack que declara `supabase_functions`, na lista `secrets:` do serviço:

- **Cenário A (recomendado, zero mudança no Args):** alias `source: mcp_query_secret_v2, target: mcp_query_secret_v1`
  ```yaml
  secrets:
    - source: mcp_query_secret_v2
      target: mcp_query_secret_v1
  ```
  O arquivo `/run/secrets/mcp_query_secret_v1` continua existindo no container **com o valor NOVO** — o `export MCP_QUERY_SECRET=$(cat ...)` do Args não precisa mudar. (O alias `target` é path de arquivo e **não** exige que o objeto secret antigo exista — a remoção do v1 (§4g) continua possível.)
- **Cenário B (higiene de nomes):** `- mcp_query_secret_v2` (sem alias) **e** atualizar o path no `Args`/entrypoint para `$(cat /run/secrets/mcp_query_secret_v2)` **no MESMO update do stack** (nunca um sem o outro — senão o `cat` aponta para arquivo inexistente → env vazia → **503** em todas as chamadas).

Regra de decisão: usar **A** se o `Args` referencia o path `v1`; usar **B** apenas se quiser limpar o nome legado (e o pré-flight confirmou que o path vive no compose, não na imagem).

> ⚠️ Pitfall validado (2026-08-07): `docker service update --env-add MCP_QUERY_SECRET=...` **imperativo é revertido no próximo redeploy do stack**. O env/secret durável vai no compose — por isso o passo (c) é via `portainer_update_stack` com o conteúdo COMPLETO.

### (d) Aplicar

```bash
# Via Portainer MCP: portainer_update_stack com o conteúdo completo do compose editado
# (prune:false, pullImage:false). Validar UpdateStatus.State == completed.
```
**Alternativa emergencial (imperativa, NÃO durável — o stack file precisa ser atualizado na mesma janela, senão o próximo redeploy regride):**
```bash
docker service update supabase_functions \
  --secret-rm mcp_query_secret_v1 \
  --secret-add source=mcp_query_secret_v2,target=mcp_query_secret_v1
# (com target=mcp_query_secret_v1 o path lido pelo Args não muda; sem o target,
#  o arquivo vira /run/secrets/mcp_query_secret_v2 e o export quebra se apontar p/ v1)
```

### (e) Atualizar o consumidor externo (worker MCP da casa)

- Substituir o valor no worker pelo **mesmo** `<NOVO_VALOR>` do passo (b).
- **Ordem recomendada:** swap do serviço (c/d) → atualizar o worker imediatamente em seguida. A janela de 401 (§5) fica entre os dois passos — o que não pode acontecer é o worker ficar com valor antigo por horas.
- Se houver **mais de um** consumidor externo com o header, atualizar todos na mesma janela.

### (f) Validação (obrigatória)

```bash
BASE=https://supabase.atomicabr.com.br/functions/v1/mcp-query

# 1) NOVO valor → 200 com rows
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$BASE" \
  -H "x-mcp-secret: <NOVO_VALOR>" -H 'content-type: application/json' \
  -d '{"sql":"SELECT 1"}'            # esperado: 200

# 2) ANTIGO valor → 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$BASE" \
  -H "x-mcp-secret: <ANTIGO_VALOR>" -H 'content-type: application/json' \
  -d '{"sql":"SELECT 1"}'            # esperado: 401

# 3) sem header → 401 (fail-closed)
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$BASE" \
  -H 'content-type: application/json' -d '{"sql":"SELECT 1"}'   # esperado: 401

# 4) fingerprint do secret montado == FP_NOVO (dentro do container)
docker exec <container-supabase_functions> sh -c \
  'printf %s "$(cat /run/secrets/mcp_query_secret_v1)" | sha256sum | cut -c1-12'
#    → deve bater com FP_NOVO do passo (b) (se Cenário A; em B, path v2)

# 5) spec do serviço: SecretName == mcp_query_secret_v2
docker service inspect supabase_functions --format \
  '{{range .Spec.TaskTemplate.ContainerSpec.Secrets}}{{.SecretName}};{{end}}'
#    → deve listar mcp_query_secret_v2 (e NÃO v1 como source)
```

### (g) Remover o secret **v1** (só depois da validação)

```bash
# 1) confirmar que NENHUM serviço referencia v1 como source (pode aparecer só como target de alias):
docker service ls -q | xargs docker service inspect --format \
  '{{.Spec.Name}}|{{range .Spec.TaskTemplate.ContainerSpec.Secrets}}{{.SecretName}};{{end}}' \
  | grep mcp_query_secret   # v1 NÃO pode aparecer como SecretName (source)

# 2) remover:
docker secret rm mcp_query_secret_v1

# 3) confirmar:
docker secret ls | grep mcp_query_secret   # só v2
```
> Se qualquer serviço ainda listar `v1` como source, **parar** — o redeploy desse stack quebraria. Revisar o stack antes de remover.

### (h) Rollback (se algo falhar)

- **Durante (c/d), antes da validação passar:** reverter o stack file para `source: mcp_query_secret_v1` + `portainer_update_stack` (idempotente) → validar 200 com o valor antigo.
- **Depois do (g):** recriar o secret v1 com o valor antigo (`printf '%s' '<ANTIGO>' | docker secret create mcp_query_secret_v1 -`) + reverter o stack file para v1 + update. O valor antigo é conhecido (está em posse do operador — era o valor em produção).
- Critério de rollback: qualquer 503/401 persistente no validador, spec divergente, ou worker externo inoperante além da janela acordada.

---

## 5. Janela de quebra esperada (fail-closed por design)

```
T0: swap do serviço (c/d) — validador passa a aceitar SÓ o NOVO valor
T0→T1: consumidor externo (worker MCP da casa) recebe 401 em TODAS as chamadas
       (header antigo rejeitado) até ser atualizado com o novo valor (e)
T1: worker atualizado → chamadas voltam a 200
```

- **Janela = T1 − T0**, tipicamente **minutos**, desde que (e) seja executado imediatamente após (d).
- O 401 é **intencional**: o validador nunca aceita dois valores (sem dual-secret). Não "consertar" com exceção temporária no código.
- Se a janela precisar ser maior, avaliar primeiro a melhoria futura da §7 (multi-secret `NEW,OLD`) antes de executar a rotação.

---

## 6. Pós-rotação (rastreabilidade)

- [ ] Data/hora da rotação + FP_NOVO registrados no changelog deste documento (ou no relatório da onda).
- [ ] `infra/stack35/SECRETS_INVENTORY.md` atualizado com `mcp_query_secret_v2` (o inventário atual não lista MCP_QUERY_SECRET).
- [ ] Varredura de confirmação pós-rotação: `grep -rni 'zappweb_mcp_' .` no repo → 0 hits (garantir que o valor vazado não ressurgiu).
- [ ] Se o vazamento original estiver no histórico do repo público: considerar também **purga do histórico** (BFG/filter-repo) fora do escopo desta rotação.

---

## 7. Notas / melhorias futuras (fora do escopo desta rotação)

- **Zero-downtime:** o validador poderia aceitar lista `NEW,OLD` separada por vírgula (como `EVOLUTION_WEBHOOK_SECRETS`) — permite rotação sem janela de 401. Requer mudança de código + deploy da função, e deve ser avaliada separadamente.
- **Worker externo versionado:** o consumidor (worker MCP da casa) não está no repo — considerar registrar o client em repo privado com o header vindo de env, para varreduras futuras acharem o touchpoint.
- **Rotação periódica:** adicionar esta rotação ao runbook de operações (`docs/ops/runbook.md`) com cadência semestral.
