import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import type { NextApiRequest, NextApiResponse } from "next";
import { serialize } from "cookie";
import { z } from "zod";
import { EVENT_CONTEXT_HEADER } from "contracts/product-events";
import {
  clientEventsEnabled,
  productEventSecret,
} from "infra/product_event_config";
import { appendResponseCookie } from "infra/response_cookies";
import {
  bindAnonymousVisit,
  visitWasBound,
} from "models/product_event_identity";

export const EVENT_COOKIE = "manifold_event_context";
const DAY = 86_400_000;
const VISIT_IDLE = 30 * 60_000;
const VISIT_MAX = DAY;
const contextSchema = z
  .object({
    v: z.literal(1),
    anonymous_id: z.uuid(),
    anonymous_expires_at: z.number().int(),
    visit_id: z.uuid(),
    visit_started_at: z.number().int(),
    last_seen_at: z.number().int(),
    generation: z.uuid(),
    actor: z.string().max(64),
  })
  .strict();
type ContextCookie = z.infer<typeof contextSchema>;
export type ProductEventContext = { anonymous_id: string; visit_id: string };
function mac(value: string, purpose: string) {
  return createHmac("sha256", productEventSecret()!)
    .update(purpose + ":" + value)
    .digest("hex");
}
function actor(userId?: string) {
  return userId ? mac(userId, "actor") : "anonymous";
}
function read(req: NextApiRequest, now = Date.now()): ContextCookie | null {
  if (!productEventSecret()) return null;
  const value = req.cookies?.[EVENT_COOKIE];
  if (!value || value.length > 2048) return null;
  const [encoded, signature, extra] = value.split(".");
  if (!encoded || !signature || extra || !/^[a-f0-9]{64}$/.test(signature))
    return null;
  const expected = mac(encoded, "cookie");
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
    return null;
  try {
    const parsed = contextSchema.safeParse(
      JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")),
    );
    if (!parsed.success) return null;
    const context = parsed.data;
    if (
      context.anonymous_expires_at <= now ||
      context.last_seen_at > now + 30_000 ||
      context.visit_started_at > now + 30_000
    )
      return null;
    return context;
  } catch {
    return null;
  }
}
function fresh(userId?: string, now = Date.now()): ContextCookie {
  return {
    v: 1,
    anonymous_id: randomUUID(),
    anonymous_expires_at: now + 90 * DAY,
    visit_id: randomUUID(),
    visit_started_at: now,
    last_seen_at: now,
    generation: randomUUID(),
    actor: actor(userId),
  };
}
function active(context: ContextCookie) {
  const now = Date.now();
  return (
    now - context.last_seen_at < VISIT_IDLE &&
    now - context.visit_started_at < VISIT_MAX
  );
}
function emit(res: NextApiResponse, context: ContextCookie) {
  const encoded = Buffer.from(JSON.stringify(context)).toString("base64url");
  appendResponseCookie(
    res,
    serialize(EVENT_COOKIE, encoded + "." + mac(encoded, "cookie"), {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: Math.max(
        1,
        Math.floor((context.anonymous_expires_at - Date.now()) / 1000),
      ),
    }),
  );
  res.setHeader(EVENT_CONTEXT_HEADER, context.generation);
  return { generation: context.generation };
}
export function validEventContext(req: NextApiRequest): ContextCookie | null {
  const context = read(req);
  return context?.actor === actor(req.context?.user?.id) && active(context)
    ? context
    : null;
}
export function eventContextForAction(
  req: NextApiRequest,
): ProductEventContext | undefined {
  if (!clientEventsEnabled()) return undefined;
  const context = validEventContext(req);
  return context
    ? { anonymous_id: context.anonymous_id, visit_id: context.visit_id }
    : undefined;
}
export async function bootstrapEventContext(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const old = read(req);
  const userId = req.context?.user?.id;
  if (old?.actor === actor(userId)) {
    if (old.actor === "anonymous" && (await visitWasBound(old.visit_id)))
      return emit(res, fresh());
    if (active(old)) return emit(res, { ...old, last_seen_at: Date.now() });
    return emit(res, {
      ...fresh(userId),
      anonymous_id: old.anonymous_id,
      anonymous_expires_at: old.anonymous_expires_at,
    });
  }
  return emit(res, fresh(userId));
}
export function touchEventContext(
  res: NextApiResponse,
  context: ContextCookie,
) {
  if (Date.now() - context.last_seen_at < 60_000) return;
  emit(res, { ...context, last_seen_at: Date.now() });
}
export async function loginEventContext(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string,
) {
  if (!clientEventsEnabled()) return;
  const old = read(req);
  const sameAccount =
    req.context?.user?.id === userId && old?.actor === actor(userId);
  const canLink =
    old &&
    active(old) &&
    (sameAccount ||
      (old.actor === "anonymous" &&
        !req.context?.user?.id &&
        (await bindAnonymousVisit({
          visit_id: old.visit_id,
          anonymous_id: old.anonymous_id,
          user_id: userId,
        }))));
  emit(
    res,
    canLink
      ? {
          ...old,
          actor: actor(userId),
          generation: randomUUID(),
          last_seen_at: Date.now(),
        }
      : fresh(userId),
  );
}
export function logoutEventContext(res: NextApiResponse) {
  if (clientEventsEnabled()) emit(res, fresh());
}
export function eventAddressKey(req: NextApiRequest): string | null {
  let address: string | undefined;
  // Only trust a platform-supplied header when the runtime itself is Vercel.
  if (process.env.VERCEL === "1") {
    const header = req.headers["x-vercel-forwarded-for"];
    if (typeof header === "string") address = header.trim();
  } else if (process.env.PRODUCT_EVENTS_PROXY_MODE === "direct") {
    address = req.socket?.remoteAddress;
  }
  if (!address || !isIP(address) || !productEventSecret()) return null;
  return "ip:" + mac(address, "quota-address");
}
