import { ApiClientError } from "lib/api-client";
import type { NotificationStatus } from "contracts/outlet-notifications";

export const notificationStatusUrl = (slug: string) =>
  `/api/v1/stores/${encodeURIComponent(slug)}/notifications`;

export class NotificationClientError extends ApiClientError {
  constructor(
    status: number,
    readonly code?: string,
  ) {
    super(status, "Could not update notification preferences");
  }
}

export async function notificationRequest<T>(
  url: string,
  method: "PUT" | "PATCH" | "POST",
  body: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new NotificationClientError(response.status, data?.context?.code);
  return data as T;
}

export function updateOutletNotifications(
  slug: string,
  enabled: boolean,
  locale?: "en" | "pt-BR",
) {
  return notificationRequest<NotificationStatus>(
    notificationStatusUrl(slug),
    "PUT",
    { enabled, ...(locale ? { locale } : {}) },
  );
}

export function needsEmailLogin(error: unknown) {
  return (
    error instanceof NotificationClientError &&
    error.code === "EMAIL_LOGIN_REQUIRED"
  );
}
