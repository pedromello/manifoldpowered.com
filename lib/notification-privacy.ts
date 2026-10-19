/** Unsubscribe URLs carry bearer capabilities and must never enter analytics. */
export function isPrivateNotificationUrl(value: string) {
  try {
    const url = new URL(value, "https://manifold.invalid");
    return /^\/(?:en\/|pt-BR\/)?notifications\/unsubscribe(?:\/|$)/.test(
      url.pathname,
    );
  } catch {
    return true;
  }
}
