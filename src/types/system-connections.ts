import { z } from 'zod';

export const systemConnectionSchema = z.object({
  name: z.string(),
  provider: z.string(),
  config: z.record(z.unknown()),
  is_active: z.boolean(),
});

export type SystemConnectionForm = z.infer<typeof systemConnectionSchema>;
