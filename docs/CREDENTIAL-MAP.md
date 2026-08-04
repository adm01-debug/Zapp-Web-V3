# 🔑 Credential Map — ZAPP WEB

> Mapa canônico de **onde vivem e como fluem** as credenciais de integração (Evolution API e correlatas).
> Última atualização: **2026-08-04**.
> ⚠️ **Nenhum valor de chave/secret é documentado aqui** — este documento descreve topologia e fluxo, não segredos.
> Regras gerais de integração: [INTEGRATION_INVARIANTS.md](./INTEGRATION_INVARIANTS.md) · Schemas: [SCHEMA_REFERENCE.md](./SCHEMA_REFERENCE.md).

---

## Fluxo de credenciais Evolution

### Topologia (3 camadas)

| Camada | Objeto | Acesso | Observações |
|---|---|---|---|
| Física | `evo.evolution_instance_credentials` | **`service_role` only** + RLS | Tabela-fonte; contém `api_key`. Nenhum role de app acessa via PostgREST. |
| View | `zapp.evolution_instance_credentials` | `authenticated` (RLS) | View `security_invoker`, **sem coluna `api_key`** — leitura segura para o front. |
| Edge Function | `evolution-credentials` | **admin/supervisor** (RPC `is_admin_or_supervisor`) | Única ponte para chave (leitura com `api_key` e escrita). |

### Leitura (GET)

1. Front chama a edge function `evolution-credentials` (GET), instância fixa **`wpp2`**.
2. Gate de role: **admin/supervisor** — `403` antes de tocar no banco.
3. Edge fn (client `service_role`) chama a RPC SECURITY DEFINER **`fn_edge_get_evolution_credentials(p_instance)`** — EXECUTE revogado de `PUBLIC`/`anon`/`authenticated`, **só `service_role`**, com guard interna de claims (`role = service_role`).
4. A RPC lê o valor do **Vault**; a edge function devolve a `api_key` **no header `X-Evolution-Key`** (nunca no body; CORS expõe `Access-Control-Expose-Headers: X-Evolution-Key`).
5. **Listagem sem chave**: o front lê direto a view `zapp.evolution_instance_credentials` (sem `api_key`) — nenhum teste de conexão com a chave é possível a partir da listagem (por design).

### Escrita (POST — actions `save` | `delete`)

1. Front chama a edge function `evolution-credentials` com `action: 'save' | 'delete'` + payload da credencial.
2. Mesmo gate do GET: **admin/supervisor** (`403` antes do banco); rate limit próprio (10/60s).
3. Edge fn (client `service_role`) chama as RPCs SECURITY DEFINER:
   - **save** → `fn_edge_upsert_evolution_credentials(...)`
   - **delete** → `fn_edge_delete_evolution_credentials(p_id uuid)`
4. As RPCs têm `search_path = ''`, EXECUTE **só `service_role`** e **nunca ecoam nem logam `api_key`**.
5. Persistência: física `evo.evolution_instance_credentials` + **Vault**; a view `zapp.*` reflete o resultado **sem** `api_key`.

### Regras duras

- `api_key` **nunca** via PostgREST — nem SELECT em view, nem RPC de leitura exposta a `authenticated`.
- `evo.evolution_instance_credentials` (física): **`service_role` only**.
- RPCs `fn_edge_*`: SECURITY DEFINER, `search_path = ''`, EXECUTE **só** `service_role`, guard de claims.
- Nenhuma chave em código frontend, docs, logs ou resposta de API.
- ⚠️ `types.ts` pode ainda expor `api_key` na view zapp (drift consciente, GAP-I): **não regenerar cegamente** — ajustar à view real (sem `api_key`).

---

## Outras credenciais (referência)

- **Banco/Supabase**: credenciais do Postgres e chaves do projeto vivem em infra (VPS/Portainer/secrets do deploy) — fora do escopo deste doc.
- **OAuth Gmail**: fluxo via RPCs `zapp.initiate_gmail_oauth()` / `zapp.complete_gmail_oauth(auth_code, p_state)` (EXECUTE `authenticated`) — OAuth code-flow, sem chave estática no front.
- Rotação de credenciais: ver `docs/security/CREDENTIAL_ROTATION_RUNBOOK.md`.
