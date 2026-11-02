/** Expose Retry-After without copying response bodies into logs or API errors. */
export function withRetryAfter<T extends Error>(
  error: T,
  response: Response,
): T {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter)
    Object.defineProperty(error, "retryAfter", { value: retryAfter });
  return error;
}
