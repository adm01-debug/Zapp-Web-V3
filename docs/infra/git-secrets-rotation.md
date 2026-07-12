# Rotação de Segredo Exposto — Evolution API Key

**Data:** 2026-07-11  
**Severidade:** CRÍTICO  
**Status:** PENDENTE — requer ação manual no VPS

## Contexto

A chave `AUTHENTICATION_API_KEY` da Evolution API foi exposta em texto puro em 3 arquivos
versionados no Git. Embora já tenha sido removida dos arquivos atuais (commit de R11),
o valor permanece no histórico Git e deve ser tratado como comprometido.

**Arquivos que continham o valor (corrigidos em R11):**
- `INFRA.md`
- `docs/infra/evolution-stack.reconciled.yml`
- `infra/migrations/20260711_P0_fix_planned_postburnin.md`

## Passos de Rotação (executar no VPS)

### 1. Gerar nova chave

```bash
openssl rand -hex 16
# Exemplo de saída: <nova-chave-32-chars>
```

### 2. Atualizar Docker Secret

```bash
# Criar novo secret
echo -n "<nova-chave>" | docker secret create evolution_api_key_v5_$(date +%Y%m%d) -

# Verificar
docker secret ls | grep evolution_api_key
```

### 3. Atualizar Stack Evolution no Portainer

No entrypoint do service `evolution_evolution`, trocar:
```bash
cat /run/secrets/evolution_api_key_v4_20260704 | tr -d '\n\r'
```
por:
```bash
cat /run/secrets/evolution_api_key_v5_YYYYMMDD | tr -d '\n\r'
```

Adicionar o novo secret à seção `secrets:` do stack e remover o antigo.

### 4. Atualizar Vault no Supabase

```sql
-- No Supabase SQL Editor (como superuser)
SELECT vault.update_secret(
  id,
  '<nova-chave>',
  'evolution_api_key'
) FROM vault.secrets WHERE name = 'evolution_api_key';
```

### 5. Invalidar secret antigo

```bash
# Verificar que a chave antiga foi revogada (deve retornar 401)
# Ler a chave antiga do secret file para não expor no histórico do shell
OLD_APIKEY=$(cat /run/secrets/evolution_api_key_v4_20260704 | tr -d '\n\r')
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "apikey: ${OLD_APIKEY}" \
  https://evolution.atomicabr.com.br/instance/fetchInstances)
echo "Status com chave antiga: $STATUS"  # Deve ser 401
unset OLD_APIKEY

# Remover o secret antigo após confirmar status 401
docker secret rm evolution_api_key_v4_20260704
```

### 6. Verificar

```bash
# Verificar tamanho da chave lendo direto do secret file (não de env var — não existe após remoção do Spec.Env)
docker exec -it $(docker ps -qf name=evolution_evolution) bash -c \
  'cat /run/secrets/evolution_api_key_v5_YYYYMMDD | tr -d "\n\r" | wc -c'
# Deve retornar: 32

# Testar autenticação — ler a chave do secret file localmente para não expor no histórico do shell
APIKEY=$(cat /run/secrets/evolution_api_key_v5_YYYYMMDD | tr -d '\n\r')
curl -s -H "apikey: ${APIKEY}" https://evolution.atomicabr.com.br/instance/fetchInstances | jq '.[0].instance.state'
# Deve retornar: "open"
unset APIKEY
```

### 7. Limpar histórico Git (opcional, recomendado)

```bash
# OBRIGATÓRIO: fazer backup verificável antes de reescrever histórico
git bundle create /tmp/zapp-web-v3-backup-$(date +%Y%m%d).bundle --all
# Verificar que o bundle é válido:
git bundle verify /tmp/zapp-web-v3-backup-$(date +%Y%m%d).bundle

# Instalar git-filter-repo se necessário
pip install git-filter-repo

# Remover o valor antigo de todo o histórico
# Substitua <CHAVE-ANTIGA> pelo valor real da chave comprometida (não versionar aqui)
TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT
echo "<CHAVE-ANTIGA>==>REDACTED_ROTATED" > "$TMPFILE"
git filter-repo --replace-text "$TMPFILE"

# Force-push (coordenar com a equipe — reescreve histórico)
git push --force-with-lease origin main
```

> **Atenção:** Reescrita de histórico em repo compartilhado requer coordenação.
> Todos os colaboradores precisam fazer `git fetch --all && git reset --hard origin/main`.

## Verificação de Outros Segredos no Repo

```bash
# Scan do repositório por padrões suspeitos
git log --all --oneline | head -50  # revisar commits recentes
grep -rn "apikey\|api_key\|password\|secret\|token" --include="*.yml" --include="*.env*" .
```
