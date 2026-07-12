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

### 2b. Capturar chave antiga ANTES do redeploy (obrigatório)

> ⚠️ **Execute este passo ANTES do Step 3.** Após o Portainer redesployar o stack
> com o novo secret, o arquivo `/run/secrets/evolution_api_key_v4_20260704` deixa de
> existir no container. Sem esta captura, o Step 5 não consegue verificar a revogação.

```bash
# Criar arquivo protegido no host para armazenar a chave antiga
OLD_KEY_FILE=$(mktemp)
chmod 600 "$OLD_KEY_FILE"
trap 'rm -f "$OLD_KEY_FILE"; exit 1' INT HUP TERM EXIT  # cleanup em sinal ou exit normal

# Capturar a chave diretamente do container ainda rodando com o secret antigo
docker exec $(docker ps -qf name=evolution_evolution) \
  bash -c "cat /run/secrets/evolution_api_key_v4_20260704 | tr -d '\n\r'" > "$OLD_KEY_FILE"

# Validar que a captura foi bem-sucedida (32 bytes = chave hex 16 bytes)
CAPTURED=$(wc -c < "$OLD_KEY_FILE" | tr -d ' ')
test "$CAPTURED" = "32" || {
  echo "ERRO: chave antiga capturada com tamanho inesperado ($CAPTURED bytes — esperado 32)" >&2
  echo "Verifique se o container está rodando e o secret está montado." >&2
  exit 1
}
echo "Chave antiga capturada com sucesso (${CAPTURED} bytes)"
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
# Usa $OLD_KEY_FILE capturado no Step 2b — NÃO tenta ler do container (secret já foi removido)
if [ ! -s "$OLD_KEY_FILE" ]; then
  echo "[AVISO] Step 2b não foi executado ou falhou — $OLD_KEY_FILE ausente/vazio." >&2
  echo "[AVISO] Verificação automática impossível. Confirme a revogação manualmente:" >&2
  echo "  curl -s -o /dev/null -w '%{http_code}' -H 'apikey: <CHAVE-ANTIGA>' \\" >&2
  echo "    https://evolution.atomicabr.com.br/instance/fetchInstances" >&2
  echo "  # Deve retornar 401" >&2
else
  OLD_APIKEY=$(cat "$OLD_KEY_FILE")
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "apikey: ${OLD_APIKEY}" \
    https://evolution.atomicabr.com.br/instance/fetchInstances)
  echo "Status com chave antiga: $STATUS"  # Deve ser 401
  unset OLD_APIKEY
  if [ "$STATUS" != "401" ]; then
    echo "[AVISO] Chave antiga ainda retorna $STATUS — aguardar propagação do redeploy e testar novamente." >&2
    echo "        NÃO remova o secret antigo até confirmar 401." >&2
    exit 1
  fi
  echo "Revogação confirmada (401). Removendo secret antigo."
fi

# Remover o secret antigo somente após confirmar 401
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
#
# IMPORTANTE: git-filter-repo recusa reescrever checkouts existentes por padrão ("Refusing to
# destructively overwrite repo history since this does not look like a fresh clone").
# Opção A (recomendada): clone em diretório temporário limpo:
#   git clone --no-local /caminho/para/zapp-web-v3 /tmp/zapp-fresh && cd /tmp/zapp-fresh
# Opção B (avançado): use --force se já estiver no clone correto e souber o que está fazendo.
#
# Nota: NÃO use trap … EXIT aqui — o trap de $OLD_KEY_FILE já está registrado no Step 2b.
# Este bloco usa cleanup explícito para evitar sobreescrever o trap anterior.
TMPFILE=$(mktemp)
echo "<CHAVE-ANTIGA>==>REDACTED_ROTATED" > "$TMPFILE"
git filter-repo --replace-text "$TMPFILE" && rm -f "$TMPFILE" || { rm -f "$TMPFILE"; exit 1; }
# Se usar Opção A, execute o force-push a partir do clone temporário e depois remova-o.

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
