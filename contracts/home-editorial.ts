import { z } from "zod";

export const homeUpdateSchema = z
  .object({
    selection_ids: z
      .array(z.uuid())
      .max(3)
      .refine((ids) => new Set(ids).size === ids.length),
    expected_revision: z.number().int().min(0).max(2147483646),
  })
  .strict();
