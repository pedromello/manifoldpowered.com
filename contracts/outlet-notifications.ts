/** Pure inputs shared by the website and the agent CLI. */
import { z } from "zod";

export const emailLocaleSchema = z.enum(["en", "pt-BR"]);
export const notificationToggleSchema = z
  .object({ enabled: z.boolean(), locale: emailLocaleSchema.optional() })
  .strict();
export const notificationPreferencesSchema = z
  .object({ email_locale: emailLocaleSchema })
  .strict();
export const notificationUnsubscribeSchema = z
  .object({ token: z.string().min(40).max(512) })
  .strict();

export type NotificationStatus = {
  available?: boolean;
  enabled: boolean;
  is_followed: boolean;
  requires_email_login: boolean;
};
export type NotificationPreferences = {
  email_locale: z.infer<typeof emailLocaleSchema>;
  has_preference: boolean;
};
export type NotificationSubscriptions = {
  email_locale: z.infer<typeof emailLocaleSchema>;
  subscriptions: Array<
    NotificationStatus & {
      store_slug: string;
      store_name: string;
    }
  >;
};
