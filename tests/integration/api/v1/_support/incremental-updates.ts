import { createHash, randomUUID } from "node:crypto";
import {
  Game,
  GameArchitecture,
  GamePlatform,
  GameRelease,
  User,
} from "generated/prisma/client";
import webserver from "infra/webserver";
import gameArtifact from "models/game_artifact";
import gameRelease from "models/game_release";
import orchestrator from "tests/orchestrator";

export async function createOwnerGame() {
  const owner = await orchestrator.createUser();
  await orchestrator.activateUser(owner.id);
  const game = await orchestrator.createGame(owner.id, {
    title: `Incremental Update ${randomUUID()}`,
  });
  const session = await orchestrator.createSession(owner.id);
  return { owner, game, session };
}

export async function createBuyer(gameId: string) {
  const buyer = await orchestrator.createUser();
  await orchestrator.activateUser(buyer.id);
  await orchestrator.addToLibrary(buyer.id, gameId);
  const session = await orchestrator.createSession(buyer.id);
  return { buyer, session };
}

export async function createDeclaredRelease(
  owner: User,
  game: Game,
  version: string,
  compressedSizeBytes = 1000,
  platform: GamePlatform = GamePlatform.WINDOWS,
  architecture: GameArchitecture = GameArchitecture.X86_64,
) {
  const release = await gameRelease.createDraft({
    game_id: game.id,
    version,
  });
  const archive = Buffer.alloc(compressedSizeBytes, version);
  const sha256 = sha(archive);
  const session = await orchestrator.createSession(owner.id);
  const response = await fetch(
    `${webserver.getOrigin()}/api/v1/releases/${release.id}/artifacts/upload-url`,
    {
      method: "POST",
      headers: {
        Cookie: `session_id=${session.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        platform,
        architecture,
        archive_format: "ZIP",
        compressed_size_bytes: compressedSizeBytes.toString(),
        installed_size_bytes: (compressedSizeBytes * 2).toString(),
        sha256,
        manifest: manifest(),
      }),
    },
  );
  if (response.status !== 201) {
    throw new Error(
      `Artifact declaration failed: ${response.status} ${await response.text()}`,
    );
  }
  const body = await response.json();
  return { release, artifact: body.artifact, sha256 };
}

export async function publishDeclaredRelease(
  declared: Awaited<ReturnType<typeof createDeclaredRelease>>,
) {
  await gameArtifact.markVerifying(declared.artifact.id);
  await gameArtifact.markReady(declared.artifact.id, {
    compressed_size_bytes: declared.artifact.compressed_size_bytes,
    installed_size_bytes: declared.artifact.installed_size_bytes,
    sha256: declared.sha256,
    manifest: manifest(),
  });
  await gameRelease.beginProcessing(declared.release.id);
  const release = await gameRelease.publish(declared.release.id);
  return { ...declared, release };
}

export function patchDeclaration(
  sourceReleaseId: string,
  patch: Buffer,
  signature: Buffer,
  overrides: Record<string, unknown> = {},
) {
  const signatureSha256 = sha(signature);
  return {
    source_release_id: sourceReleaseId,
    platform: "WINDOWS",
    architecture: "X86_64",
    algorithm: "WHARF",
    format_version: "1",
    patch: {
      size_bytes: patch.byteLength.toString(),
      sha256: sha(patch),
    },
    signature: {
      size_bytes: signature.byteLength.toString(),
      sha256: signatureSha256,
    },
    expected_installation_sha256: signatureSha256,
    generation_duration_ms: "1250",
    ...overrides,
  };
}

export function requestPatchUpload(
  targetReleaseId: string,
  sessionToken: string,
  body: unknown,
) {
  return fetch(
    `${webserver.getOrigin()}/api/v1/releases/${targetReleaseId}/patches/upload-url`,
    {
      method: "POST",
      headers: {
        Cookie: `session_id=${sessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}

export async function uploadPatchFiles(
  initiated: {
    uploads: {
      patch: { url: string; required_headers: Record<string, string> };
      signature: { url: string; required_headers: Record<string, string> };
    };
  },
  patch: Buffer,
  signature: Buffer,
) {
  const [patchResponse, signatureResponse] = await Promise.all([
    fetch(initiated.uploads.patch.url, {
      method: "PUT",
      headers: initiated.uploads.patch.required_headers,
      body: Uint8Array.from(patch).buffer,
    }),
    fetch(initiated.uploads.signature.url, {
      method: "PUT",
      headers: initiated.uploads.signature.required_headers,
      body: Uint8Array.from(signature).buffer,
    }),
  ]);
  if (patchResponse.status !== 200 || signatureResponse.status !== 200) {
    throw new Error(
      `Patch upload failed: patch=${patchResponse.status} signature=${signatureResponse.status}`,
    );
  }
}

export function requestPatchConfirmation(
  patchId: string,
  sessionToken: string,
) {
  return fetch(`${webserver.getOrigin()}/api/v1/patches/${patchId}/confirm`, {
    method: "POST",
    headers: { Cookie: `session_id=${sessionToken}` },
  });
}

export function requestUpdate(
  gameSlug: string,
  sourceReleaseId: string,
  sessionToken?: string,
) {
  const query = new URLSearchParams({
    source_release_id: sourceReleaseId,
    platform: "WINDOWS",
    arch: "X86_64",
  });
  return fetch(
    `${webserver.getOrigin()}/api/v1/games/${gameSlug}/updates/latest?${query}`,
    sessionToken
      ? { headers: { Cookie: `session_id=${sessionToken}` } }
      : undefined,
  );
}

export function requestPatchDownload(patchId: string, sessionToken?: string) {
  return fetch(`${webserver.getOrigin()}/api/v1/patches/${patchId}/download`, {
    method: "POST",
    ...(sessionToken
      ? { headers: { Cookie: `session_id=${sessionToken}` } }
      : {}),
  });
}

export async function createReadyPatch({
  owner,
  sessionToken,
  source,
  target,
  patchSize = 400,
}: {
  owner: User;
  sessionToken: string;
  source: GameRelease;
  target: GameRelease;
  patchSize?: number;
}) {
  const patchFile = Buffer.alloc(patchSize, "p");
  const signature = Buffer.from(`signature-${target.id}`);
  const response = await requestPatchUpload(
    target.id,
    sessionToken,
    patchDeclaration(source.id, patchFile, signature),
  );
  if (response.status !== 201) {
    throw new Error(
      `Patch declaration failed: ${response.status} ${await response.text()}`,
    );
  }
  const initiated = await response.json();
  await uploadPatchFiles(initiated, patchFile, signature);
  const confirmation = await requestPatchConfirmation(
    initiated.patch.id,
    sessionToken,
  );
  if (confirmation.status !== 200) {
    throw new Error(
      `Patch confirmation failed: ${confirmation.status} ${await confirmation.text()}`,
    );
  }
  return { owner, patch: initiated.patch, patchFile, signature };
}

export function hasInternalStorageField(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasInternalStorageField);
  for (const [key, child] of Object.entries(value)) {
    if (key.includes("storage_object_key") || key === "created_by_user_id") {
      return true;
    }
    if (hasInternalStorageField(child)) return true;
  }
  return false;
}

export function manifest() {
  return {
    schema_version: "1" as const,
    entrypoint: "game.exe",
    launch_arguments: [],
    executables: ["game.exe"],
    environment: {},
  };
}

export function sha(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}
