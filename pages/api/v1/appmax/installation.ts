import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import { z } from "zod";
import controller from "infra/controller";
import { NotFoundError, ServiceError, ValidationError } from "infra/errors";
import {
  authorizeAppstoreInstallation,
  generateAppstoreMerchant,
  getAppstoreAccessToken,
  verifyAppstoreMerchantQuote,
} from "infra/payments/appmax-appstore-client";
import {
  appmaxInstallationStagingEnabled,
  findAppmaxInstallation,
  merchantCredentialDigest,
  stageAppmaxInstallation,
} from "models/appmax_installation";

const authorizationToken = z.string().regex(/^[A-Za-z0-9_-]{16,512}$/);
const installationRequest = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("authorize") }),
  z.strictObject({
    action: z.literal("complete"),
    token: authorizationToken,
    amount_cents: z.number().int().positive().max(100_000_000),
  }),
]);

export const config = { api: { bodyParser: { sizeLimit: "4kb" } } };

function installationUnavailable() {
  return new NotFoundError({
    message: "Appmax sandbox installation is unavailable.",
    action: "Check the homologation setup.",
  });
}

function operatorAuthorized(header: string | undefined) {
  const expected = process.env.APPMAX_APPSTORE_INSTALL_OPERATOR_TOKEN;
  if (!expected || !/^[A-Za-z0-9_-]{32,128}$/.test(expected)) return false;
  const received = header?.match(/^Bearer ([A-Za-z0-9_-]{32,128})$/)?.[1];
  return Boolean(
    received &&
    received.length === expected.length &&
    timingSafeEqual(Buffer.from(received), Buffer.from(expected)),
  );
}

function previewOrigin() {
  const configured = process.env.MANIFOLD_PREVIEW_ORIGIN;
  const branch = process.env.VERCEL_BRANCH_URL;
  const url = URL.parse(configured || (branch ? `https://${branch}` : ""));
  if (
    !url ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.port
  ) {
    throw installationUnavailable();
  }
  return url.origin;
}

async function appCredentialsToken() {
  // The Preview may initially have the app credentials in the checkout slots.
  const appId = process.env.APPMAX_APPSTORE_CLIENT_ID;
  const appSecret = process.env.APPMAX_APPSTORE_CLIENT_SECRET;
  const clientId =
    appId || (appSecret ? undefined : process.env.APPMAX_CLIENT_ID);
  const clientSecret =
    appSecret || (appId ? undefined : process.env.APPMAX_CLIENT_SECRET);
  if (!clientId || !clientSecret) throw installationUnavailable();
  return getAppstoreAccessToken(clientId, clientSecret);
}

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  const parsed = authorizationToken.safeParse(req.query.token);
  if (
    !appmaxInstallationStagingEnabled() ||
    !parsed.success ||
    !(await findAppmaxInstallation(parsed.data))
  ) {
    throw installationUnavailable();
  }
  return res.redirect(303, "/");
}

async function postHandler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (
    !appmaxInstallationStagingEnabled() ||
    !operatorAuthorized(req.headers.authorization)
  ) {
    throw installationUnavailable();
  }
  const request = installationRequest.safeParse(req.body);
  if (!request.success) {
    throw new ValidationError({
      message: "Invalid Appmax sandbox installation request.",
    });
  }

  if (request.data.action === "authorize") {
    const appId = z.uuid().safeParse(process.env.APPMAX_APPSTORE_APP_ID);
    if (!appId.success) throw installationUnavailable();
    const callback = new URL("/api/v1/appmax/installation", previewOrigin());
    const externalKey = randomBytes(32).toString("base64url");
    const token = await authorizeAppstoreInstallation(
      await appCredentialsToken(),
      appId.data,
      externalKey,
      callback.href,
    );
    await stageAppmaxInstallation(externalKey, token);
    return res.status(200).json({
      authorization_url: `https://breakingcode.sandboxappmax.com.br/appstore/integration/${encodeURIComponent(token)}`,
    });
  }

  const { token, amount_cents } = request.data;
  if (!(await findAppmaxInstallation(token))) throw installationUnavailable();
  const merchant = await generateAppstoreMerchant(
    await appCredentialsToken(),
    token,
  );
  const installation = await findAppmaxInstallation(token);
  if (
    !installation?.external_id ||
    (installation.credential_digest &&
      installation.credential_digest !== merchantCredentialDigest(merchant))
  ) {
    throw new ServiceError({
      message: "Appmax did not confirm the External ID for this installation.",
      action: "Review the installation health check before retrying.",
    });
  }

  // Appmax issues these credentials once. Deliver them to the authorized
  // operator even if the independent quote request needs to be retried.
  const quote = await getAppstoreAccessToken(
    merchant.client_id,
    merchant.client_secret,
  )
    .then((merchantToken) =>
      verifyAppstoreMerchantQuote(merchantToken, amount_cents),
    )
    .catch(() => null);
  return res.status(200).json({
    external_id: installation.external_id,
    client_id: merchant.client_id,
    client_secret: merchant.client_secret,
    quote,
  });
}

export default createRouter<NextApiRequest, NextApiResponse>()
  .get(getHandler)
  .post(postHandler)
  .handler(controller.errorHandlers);
