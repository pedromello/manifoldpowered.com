import { z } from "zod";
import { ServiceError } from "infra/errors";
import { appmaxQuotes } from "./appmax";

const sandboxAuth = "https://auth.sandboxappmax.com.br/oauth2/token";
const sandboxApi = "https://api.sandboxappmax.com.br";

const appTokenResponse = z.object({ access_token: z.string().min(1) });
const authorizeResponse = z.object({
  data: z.object({ token: z.string().min(1) }),
});
const merchantResponse = z.object({
  data: z.object({
    client: z.object({
      client_id: z.string().min(1),
      client_secret: z.string().min(1),
    }),
  }),
});

type AppstoreStage =
  | "authentication"
  | "installation authorization"
  | "merchant credential generation"
  | "merchant quote";

function appstoreError(stage: AppstoreStage, status?: number) {
  return new ServiceError({
    message: `Appmax sandbox ${stage} failed.`,
    action: "Check the Appmax sandbox installation status and configuration.",
    context: {
      stage,
      ...(status !== undefined && { upstream_status: status }),
    },
  });
}

async function post(url: string, init: RequestInit, stage: AppstoreStage) {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw appstoreError(stage);
  }
  if (!response.ok) throw appstoreError(stage, response.status);

  try {
    const body = await response.text();
    if (body.length <= 1024 * 1024) {
      const payload: unknown = JSON.parse(body);
      return payload;
    }
  } catch {
    // The upstream body can contain credentials even if it is malformed.
  }
  throw appstoreError(stage, response.status);
}

function authenticatedJson(accessToken: string, body: Record<string, unknown>) {
  return {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

export async function getAppstoreAccessToken(
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const stage = "authentication";
  const payload = await post(
    sandboxAuth,
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    },
    stage,
  );
  const result = appTokenResponse.safeParse(payload);
  if (!result.success) throw appstoreError(stage);
  return result.data.access_token;
}

export async function authorizeAppstoreInstallation(
  accessToken: string,
  appId: string,
  externalKey: string,
  callbackUrl: string,
): Promise<string> {
  const stage = "installation authorization";
  const payload = await post(
    sandboxApi + "/app/authorize",
    authenticatedJson(accessToken, {
      app_id: appId,
      external_key: externalKey,
      url_callback: callbackUrl,
    }),
    stage,
  );
  const result = authorizeResponse.safeParse(payload);
  if (!result.success) throw appstoreError(stage);
  return result.data.data.token;
}

export async function generateAppstoreMerchant(
  accessToken: string,
  token: string,
): Promise<{ client_id: string; client_secret: string }> {
  const stage = "merchant credential generation";
  const payload = await post(
    sandboxApi + "/app/client/generate",
    authenticatedJson(accessToken, { token }),
    stage,
  );
  const result = merchantResponse.safeParse(payload);
  if (!result.success) throw appstoreError(stage);
  return result.data.data.client;
}

export async function verifyAppstoreMerchantQuote(
  accessToken: string,
  amountCents: number,
): Promise<{ installments: number; total_minor: number }[]> {
  const stage = "merchant quote";
  const payload = await post(
    sandboxApi + "/v1/payments/installments",
    authenticatedJson(accessToken, {
      installments: 12,
      total_value: amountCents,
      settings: true,
    }),
    stage,
  );
  try {
    return appmaxQuotes(payload, amountCents).map(
      ({ installments, total_minor }) => ({ installments, total_minor }),
    );
  } catch {
    throw appstoreError(stage);
  }
}
