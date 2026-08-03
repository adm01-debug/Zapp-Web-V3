# Supabase Edge Functions — zapp-web-v3

## Por que existe um `deno.json` na raiz do projeto?

O arquivo `deno.json` na raiz do repositório é requerido pelo **Supabase CLI**
para desenvolvimento local de Edge Functions. O CLI usa Deno para lint,
type-check e bundle das funções antes de deploy.

Não é um indicativo de que o projeto usa Deno para o frontend — o frontend
é React/Vite/TypeScript com Node.js/bun.

## Estrutura das Edge Functions

```\nsupabase/
  functions/
    ...                  # ~120 edge functions no diretório
  config.toml            # Config do projeto Supabase local
  migrations/            # Migrations SQL
deno.json                # Config do Deno CLI (requerido pelo Supabase CLI)
```

## Desenvolvimento local

```bash
# Instalar Supabase CLI
npm install -g supabase

# Iniciar Supabase local
supabase start

# Deploy de uma função
supabase functions deploy <nome-da-funcao>

# Testar localmente
supabase functions serve <nome-da-funcao>
```

## Variáveis de ambiente para Edge Functions

As funções leem variveis de ambiente do Supabase Vault ou do ambiente do
container. As variáveis relevantes estão documentadas em `.env.example`.
