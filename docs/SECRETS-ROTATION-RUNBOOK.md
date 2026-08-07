# Runbook de Rotação de Secrets — Docker Swarm (AtomicaBR)

> **Status:** v1.0 — formalizado em 2026-08-06 (AG-EX-20, governança wave 2).
> **Escopo:** swarm de produção (1 nó manager, Docker 28.1.1, Portainer 2.39.5).
> **Regra inviolável:** NUNCA imprimir valores de secrets em chat, relatório, log
> ou artefato — apenas nomes, endpoints públicos e fingerprints `sha256[0:12]`.
> **Referências:** skill `portainer-ops` (padrão validado F2-09) e `swarm-secret-ops`.

---

## 1. Por que este runbook existe

A auditoria de governança (AG-EX-10, itens 5/6) identificou:

- **Dívida de aliasing:** secrets rotacionados com `source: <novo>` + `target: <antigo>`
  para não tocar entrypoints (padrão F2-09). Isso é **temporário por natureza** —
  se o target nunca for renomeado, o nome do arquivo fica mentindo sobre a versão.
- **Órfãos:** versões antigas de secrets ficaram para trás após rotações (ex.:
  `supabase_service_key_v1/_v2`, `sentry_dsn_consumer_v1`, `watchdog_sentry_dsn_v1`
  — removidos em 2026-08-06, ver §6).
- **Stack file × runtime:** redeploys a partir de compose desatualizado regridem
  secrets silenciosamente.

**Objetivo:** processo canônico de rotação em que **nenhum secret órfão sobrevive**
e **nenhum alias vira permanente**.

---

## 2. Conceitos e regras

| Regra | Detalhe |
|---|---|
| Imutabilidade | `docker secret` não tem update — rotacionar = criar novo + remover antigo. |
| Alias temporário | `--secret-add source=<vN+1>,target=<vN>` preserva o path do arquivo e evita mudar entrypoint. **Só para a janela de rotação.** |
| Sem alias permanente | Na primeira janela de redeploy do serviço, renomear o target para o nome do source e remover declarações órfãs do compose. |
| Fingerprint | Comparar valores apenas por `sha256` (12 chars). Cuidado com trailing newline: `printf '%s' "$(cat /run/secrets/x)" | sha256sum`. |
| Validação | Novo valor → 200; antigo → 401 (fail-closed). |
| Janela | Rotação de chave crítica (service role, JWT) exige janela de manutenção e rollback testado. |
| Stack file | Sincronizar SEMPRE o compose no Portainer após a rotação, senão o próximo `update_stack` regride. |

---

## 3. Ciclo canônico de rotação (novo secret → update → validação → rm do antigo)

Executar via `portainer_exec_container` no `docker-housekeeping_cleanup`
(imagem `docker:28-cli` com socket) ou no host da VPS.

### Passo 1 — Gerar o novo valor DENTRO do container (nunca no chat)

```bash
NEW="$(cat /proc/sys/kernel/random/uuid | tr -d '-')$(cat /proc/sys/kernel/random/uuid | tr -d '-')"
printf '%s' "$NEW" | docker secret create <nome>_v<N+1> -
```

> A imagem docker:28-cli não tem openssl — o uuid do kernel serve. Para chaves
> que exigem formato específico (JWT service_role), usar o script
> `generate-service-key-incontainer.sh` da skill `swarm-secret-ops`
> (gera e valida tudo dentro do `supabase_kong`, sem o valor sair do container).

### Passo 2 — Aplicar no runtime (alias temporário)

```bash
docker service update <svc> \
  --secret-rm <nome>_v<N> \
  --secret-add source=<nome>_v<N+1>,target=<nome>_v<N>
```

- O `target` preserva `/run/secrets/<nome>_v<N>` → entrypoints continuam funcionando.
- Para N serviços que usam o mesmo secret: repetir por serviço (ou stack deploy).

### Passo 3 — Validar

1. **Novo valor funciona:** chamada real com a nova chave → HTTP 200
   (REST/Auth/Storage/Functions/Studio/Evolution conforme o caso).
2. **Antigo valor morreu:** montar o secret antigo num serviço descartável e
   verificar 401:
   ```bash
   docker service create --name val-secret-antigo --restart-condition none \
     --secret <nome>_v<N> docker:28-cli sh -c 'cat /run/secrets/<nome>_v<N>'
   docker service logs val-secret-antigo   # NUNCA imprimir o valor — comparar fp
   docker service rm val-secret-antigo
   ```
3. **Logs sem 401** nos serviços rotacionados (janela de observação 15–30 min).

### Passo 4 — Sincronizar o stack file (Portainer)

Buscar `portainer_get_stack_file`, editar a lista de secrets dos serviços
(`source: <vN+1>` com `target: <vN>` — alias) + declarar o secret novo em
`secrets:` no fim do compose, e devolver o arquivo completo via
`portainer_update_stack` (o MCP NÃO faz merge — sempre o arquivo inteiro).

> ⚠️ Pitfall: se o runtime foi atualizado com `docker service update` e o stack
> file não for sincronizado, o próximo redeploy do stack regride para o valor
> velho.

### Passo 5 — Remover o secret antigo (só depois da validação)

```bash
docker secret rm <nome>_v<N>
```

- O daemon **recusa** a remoção se algum serviço ainda referenciar o secret —
  usar `docker service inspect <svc> --format '{{json .Spec.TaskTemplate.ContainerSpec.Secrets}}'`
  para achar os que sobraram.
- **Órfãos confirmados** (não referenciados por NENHUM serviço) podem ser
  removidos sem janela, mas SEMPRE conferir os stack files primeiro: um compose
  que declare `source: <antigo>` (sem alias) quebraria o próximo redeploy.

### Passo 6 — Eliminar o alias (janela de redeploy, "sem alias permanente")

Na primeira manutenção do stack após a rotação:

1. No compose, trocar `source: <vN+1>, target: <vN>` por `source: <vN+1>`
   (target default = nome do source).
2. Atualizar entrypoints que liam o path antigo (ex.: `cat /run/secrets/<vN>` →
   `/run/secrets/<vN+1>`).
3. Remover do bloco `secrets:` qualquer declaração órfã (`<vN>` não usado).
4. Redeploy com `update_config: order=stop-first, failure_action=rollback,
   monitor=180s` e validar saúde do serviço.

> O alias só existe para evitar tocar entrypoints numa rotação emergencial.
> Ele nunca deve sobreviver a um ciclo completo.

---

## 4. Checklist rápido (1 minuto)

- [ ] Valor novo gerado dentro do container (nunca no chat/report)
- [ ] `--secret-add source=vN+1,target=vN` em todos os serviços consumidores
- [ ] Validação: novo → 200 · antigo → 401 (serviço descartável)
- [ ] Stack file sincronizado no Portainer (arquivo completo)
- [ ] `docker secret rm vN` OK (daemon não recusou = nenhuma referência)
- [ ] `docker secret ls` sem órfãos novos · alias documentado p/ remoção na próxima janela

---

## 5. Rotação de chaves específicas

### 5.1 Service role key do Supabase (crítica)

Touchpoints (inventário da skill `swarm-secret-ops`):
1. Secrets Swarm montados: functions, kong, storage, studio, evolution, n8n-keyfix.
2. **kong.yml declarativo** (volume na VPS) — consumer `service_role` com keyauth:
   a chave que os gates de CI usam (`ZAPP_META_TOKEN`) NÃO é env do stack.
   Extrair do kong.yml → provar com curl (`/pg/query` 200 vs 401) → `gh secret set`
   → re-disparar o gate (runbook completo: `swarm-secret-ops/references/meta-token-rotation.md`).
3. GitHub Actions `secrets.SUPABASE_SERVICE_ROLE_KEY` e `ZAPP_META_TOKEN`.
4. MCPs externos (gateway) — conferir antes de revogar.
5. Studio usa a key via secret (não mais literal).

Ordem de deploy após rotação: functions → storage → kong → studio; validar auth
em cada um; revogar a antiga após 24–72 h.

### 5.2 JWT_SECRET / DB password / VAULT_ENC_KEY

- `supabase_jwt_secret_v1` e `_v2` coexistem hoje (db/realtime usam v2; auth/rest/
  supavisor ainda v1) — rotação total do JWT é um projeto (repassa todos os
  tokens), não uma troca de secret. Tratar como janela de manutenção.
- `supabase_vault_enc_key_v1` foi criado (2026-08-06) mas **nenhum serviço o
  monta** — o supavisor ainda usa o literal `your-encryption-key-32-chars-min`
  (placeholder). Não remover: aguarda o fix VAULT_ENC_KEY (wave 3); se o fix for
  cancelado, remover como órfão.

### 5.3 Sentry DSNs

- Padrão aplicado em 2026-08-06: `sentry_dsn_consumer_cloud_v1` → target
  `sentry_dsn_consumer_v1` (consumer) e `watchdog_sentry_dsn_cloud_v1` → target
  `watchdog_sentry_dsn_v1` (watchdog-baileys). Os antigos foram removidos.
- Validar destino: fingerprint do DSN no `/proc/1/environ` do PID 1 vs esperado
  + contador `sentry_sent=N` crescendo (ver skill `swarm-secret-ops`).

---

## 6. Faxina executada em 2026-08-06 (AG-EX-20)

Inventário: `docker secret ls` (58) × referências de TODOS os serviços
(`docker service ls -q | xargs docker service inspect --format ...`).

**Órfãos confirmados e removidos (4):**

| Secret | Idade | Substituído por | Evidência |
|---|---|---|---|
| `supabase_service_key_v1` | 7 semanas | `supabase_service_key_v3` | Nenhum serviço referencia source v1; evolution monta `source v3 → target v1`; stack 25 declara v1 sem uso |
| `supabase_service_key_v2` | 21 h | `supabase_service_key_v3` | Nenhuma referência (runtime ou stack 35) |
| `sentry_dsn_consumer_v1` | 3 meses | `sentry_dsn_consumer_cloud_v1` | Stack 113 usa source cloud → target antigo |
| `watchdog_sentry_dsn_v1` | 3 meses | `watchdog_sentry_dsn_cloud_v1` | Stack 109 usa source cloud → target antigo |

**Mantido intencionalmente:** `supabase_vault_enc_key_v1` (19 h, fix pendente — §5.2).

**Dívida de aliasing que permanece (onda 3 — requer redeploy):**
- `evolution_evolution`: `supabase_service_key_v3 → target supabase_service_key_v1`
  (stack 25) — renomear target para `supabase_service_key_v3`.
- `supabase_functions`: `evolution_api_key_v5_20260805 → target evolution_api_key_v4_20260704`
  (stack 35) — renomear target para o nome do source.
- `evolution_evolution`: `evolution_api_key_v5_20260805 → target evolution_api_key_v4_20260704`
  (stack 25) — idem.

> Após a onda 3 (renomear targets + redeploy), `docker secret ls` deve mostrar
> zero aliasing e zero órfãos. Registrar no label `com.atomicabr.audit` dos serviços.

---

## 7. Referências

- Skill `portainer-ops` — padrão F2-09 (rotação validada), pitfall distroless,
  `update_stack` sem merge, interpolação `$$`.
- Skill `swarm-secret-ops` — fingerprints, evidência de runtime
  (`/proc/1/environ`), rotação service role + kong.yml, Sentry.
- AG-EX-10 (item 5/6) e AG-EX-20 — trilha de auditoria.
