import { Readable } from "node:stream";
import type { NextApiHandler, NextApiRequest, NextApiResponse } from "next";

// Invokes real Next.js handlers with request/response doubles. There is no
// HTTP listener or browser here; authentication and persistence are not mocked.
export async function apiRequest<T>(
  handler: NextApiHandler,
  {
    url,
    method = "POST",
    body,
    query = {},
    session,
    headers = {},
  }: {
    url: string;
    method?: string;
    body?: unknown;
    query?: NextApiRequest["query"];
    session?: string;
    headers?: NextApiRequest["headers"];
  },
) {
  const req = Readable.from([]) as NextApiRequest;
  Object.assign(req, {
    url,
    method,
    body,
    query,
    headers,
    cookies: session ? { session_id: session } : {},
    socket: { remoteAddress: "192.0.2.1" },
  });
  const result = {
    status: 200,
    body: undefined as T,
    headers: {} as Record<string, string | string[]>,
  };
  const res = {
    status(value: number) {
      result.status = value;
      return res;
    },
    json(value: unknown) {
      result.body = JSON.parse(JSON.stringify(value));
      return res;
    },
    setHeader(key: string, value: string | string[]) {
      result.headers[key.toLowerCase()] = value;
      return res;
    },
    end() {
      return res;
    },
  } as unknown as NextApiResponse;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      handler(req, res),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Handler timed out: ${method} ${url}`)),
          15000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
  return result;
}
