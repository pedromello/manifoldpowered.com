import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "generated/prisma/client";
import { prisma } from "infra/database";
import { ServiceError } from "infra/errors";
import { sandboxEnabled } from "infra/runtime";

const installationLifetimeMs = 60 * 60 * 1000;
const externalKeyPattern = /^[A-Za-z0-9_-]{43}$/;

type MerchantCredentials = {
  client_id: string;
  client_secret: string;
};

type CapturedInstallation = {
  external_id: string | null;
  credential_digest: string | null;
};

export function appmaxInstallationStagingEnabled() {
  return (
    process.env.VERCEL_ENV === "preview" &&
    process.env.APP_ENV === "hml" &&
    process.env.POSTGRES_DB === "homolog" &&
    sandboxEnabled()
  );
}

function installationUnavailable() {
  return new ServiceError({
    message: "Appmax installation staging is unavailable.",
    action: "Check the Preview and homologation database settings.",
  });
}

async function withHomologDatabase<Result>(
  query: (tx: Prisma.TransactionClient) => Promise<Result>,
): Promise<Result> {
  return prisma.$transaction(async (tx) => {
    const [connection] = await tx.$queryRaw<[{ name: string }]>`
      SELECT current_database() AS name
    `;
    if (connection?.name !== "homolog") throw installationUnavailable();
    return query(tx);
  });
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function merchantCredentialDigest(merchant: MerchantCredentials) {
  return digest(JSON.stringify([merchant.client_id, merchant.client_secret]));
}

export async function stageAppmaxInstallation(
  externalKey: string,
  authorizationToken: string,
): Promise<void> {
  if (!appmaxInstallationStagingEnabled()) throw installationUnavailable();
  if (!externalKeyPattern.test(externalKey)) {
    throw new ServiceError({
      message: "Invalid Appmax installation key.",
      action: "Start a new sandbox installation.",
    });
  }

  const now = new Date();
  await withHomologDatabase(async (tx) => {
    await tx.appmaxInstallationAttempt.deleteMany({
      where: { expires_at: { lte: now } },
    });
    await tx.appmaxInstallationAttempt.create({
      data: {
        external_key_hash: digest(externalKey),
        authorization_token_hash: digest(authorizationToken),
        expires_at: new Date(now.getTime() + installationLifetimeMs),
      },
    });
  });
}

export async function captureAppmaxInstallation(
  externalKey: string,
  merchant?: MerchantCredentials,
): Promise<string | undefined> {
  if (
    !appmaxInstallationStagingEnabled() ||
    !externalKeyPattern.test(externalKey)
  )
    return;

  const match = {
    external_key_hash: digest(externalKey),
    expires_at: { gt: new Date() },
  };
  return withHomologDatabase(async (tx) => {
    // Concurrent health checks must agree on the exact UUID Appmax receives.
    await tx.appmaxInstallationAttempt.updateMany({
      where: { ...match, external_id: null },
      data: {
        external_id: randomUUID(),
        credential_digest: merchant ? merchantCredentialDigest(merchant) : null,
      },
    });
    const attempt = await tx.appmaxInstallationAttempt.findFirst({
      where: match,
      select: { external_id: true },
    });
    return attempt?.external_id ?? undefined;
  });
}

export async function findAppmaxInstallation(
  authorizationToken: string,
): Promise<CapturedInstallation | null> {
  if (!appmaxInstallationStagingEnabled()) return null;
  return withHomologDatabase((tx) =>
    tx.appmaxInstallationAttempt.findFirst({
      where: {
        authorization_token_hash: digest(authorizationToken),
        expires_at: { gt: new Date() },
      },
      select: { external_id: true, credential_digest: true },
    }),
  );
}
