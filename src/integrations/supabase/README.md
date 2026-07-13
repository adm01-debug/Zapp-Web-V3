# Supabase Integration — Convenções

## Regra de ouro

**Toda coluna referenciada em código passa por `columnMap.ts`.**

Divergências entre nomes canônicos e legados (ex.: `whatsapp_connections.name`
vs. `instance_name`, `contacts.phone` vs. `remote_jid`, `messages.agent_id` vs.
`sender_id`) geraram incidentes reais. Para evitar regressão:

1. `columnMap.ts` — fonte única. Descreve, por entidade: coluna canônica,
   aliases legados aceitos na leitura, `select()` recomendado, defaults de UI.
2. `rowNormalizers.ts` — wrappers que consomem o `columnMap` e devolvem shapes
   canônicos (`WhatsAppConnectionCanonical`, `ContactCanonical`, etc.).
3. `evolutionInstanceName(conn)` — resolve nome de instância para chamadas à
   Evolution API delegando ao `columnMap`.
4. `scripts/check-column-map.mjs` — bloqueia PRs que reintroduzam
   `'instance_name'` como coluna física fora dos arquivos permitidos.

## Como adicionar uma nova coluna

1. Adicione o descriptor em `columnMap.ts`, com `physical`, `aliases?` e
   `default?` quando fizer sentido.
2. Se a leitura pode chegar em shapes divergentes, escreva o normalizer em
   `rowNormalizers.ts`.
3. Consuma via `entityMap.select({ include: [...] })` em vez de string mágica.
4. Rode `node scripts/check-column-map.mjs` local antes de abrir PR.

## Exemplo

```ts
import { columnMap } from '@/integrations/supabase/columnMap';
import { normalizeConnection } from '@/integrations/supabase/rowNormalizers';

const { data } = await supabase
  .from('whatsapp_connections')
  .select(columnMap.whatsapp_connections.select());

const rows = (data ?? []).map(normalizeConnection).filter(Boolean);
```

## Entidades cobertas na v1

`whatsapp_connections`, `contacts`, `profiles`, `messages`, `failed_messages`,
`queue_members`. Próximas ondas: `evolution_send_idempotency`, `csat_surveys`,
`conversation_transfers`.

## Fora de escopo

- Geração automática do `columnMap` a partir de `types.ts` (o gerador não
  conhece aliases legados nem defaults de UI).
- Tabelas `evo.*` (RLS restritiva; sem acesso do client).
