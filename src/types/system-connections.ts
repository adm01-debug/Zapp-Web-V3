import { z } from "zod";

export const systemConnectionSchema = z.object({
  name: z.string().min(1),
  provider: z.string().min(1).default("supabase_external"),
  config: z.record(z.unknown()).default({}),
  is_active: z.boolean().default(true),
});

export type SystemConnectionForm = z.infer<typeof systemConnectionSchema>;
