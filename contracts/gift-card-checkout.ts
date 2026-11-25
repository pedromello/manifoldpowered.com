import { z } from "zod";

export const startGiftCardCheckout = z
  .object({
    email: z.string().trim().max(234).email(),
    product_code: z.string().min(1).max(255),
    intent_id: z.uuid(),
    locale: z.enum(["pt-BR", "en"]).optional(),
  })
  .strict();

export const verifyGiftCardCheckout = z
  .object({
    challenge_id: z.uuid(),
    code: z.string().regex(/^\d{6}$/),
  })
  .strict();

export const resendGiftCardCheckout = z
  .object({
    challenge_id: z.uuid(),
    locale: z.enum(["pt-BR", "en"]).optional(),
  })
  .strict();

export const giftCardCheckoutResponse = z.union([
  z.object({
    challenge_id: z.uuid(),
    retry_after: z.number().int().positive(),
    masked_email: z.string().min(1),
  }),
  z.object({ checkout_url: z.templateLiteral(["/checkout/", z.uuid()]) }),
]);
