# Edge Functions — _shared/

## Schema

Todas as Edge Functions devem usar `db: { schema: "zapp" }` ao criar clientes Supabase.

Use os helpers centralizados:

```ts
import { createZappAdminClient, createZappClient } from "../_shared/db-client.ts";

// Admin (service_role, sem auth do caller)
const admin = createZappAdminClient();

// Caller (anon key + JWT do header Authorization)
const supabase = createZappClient(req);
```

Veja: [../../docs/SCHEMA_REFERENCE.md](../../docs/SCHEMA_REFERENCE.md)
