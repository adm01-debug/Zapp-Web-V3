import { z } from 'zod';

/** system Connection Schema. */
export const systemConnectionSchema = z.object({
  name: z.string(),
  provider: z.string(),
  config: z.record(z.string(), z.unknown()),
  is_active: z.boolean(),
});

/** System Connection Form. */
export type SystemConnectionForm = z.infer<typeof systemConnectionSchema>;
