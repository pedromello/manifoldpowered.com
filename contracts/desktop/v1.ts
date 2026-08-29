import { z } from "zod";

export const DESKTOP_API_VERSION = "1" as const;
export const INSTALL_MANIFEST_SCHEMA_VERSION = "1" as const;
export const RELEASE_PATCH_ALGORITHM = "WHARF" as const;
export const RELEASE_PATCH_FORMAT_VERSION = "1" as const;
export const PATCH_MAX_FULL_SIZE_PERCENT = 80 as const;

export const desktopPlatformSchema = z.enum(["WINDOWS", "MAC", "LINUX"]);
export const desktopArchitectureSchema = z.enum(["X86_64", "AARCH64"]);
export const archiveFormatSchema = z.literal("ZIP");

export const identifierSchema = z.uuid();
export const timestampSchema = z.iso.datetime({ offset: true });
export const byteSizeSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/, "Size must be an unsigned decimal string");
export const sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "SHA-256 must be lowercase hexadecimal");

export const desktopApiVersionSchema = z.literal(DESKTOP_API_VERSION);
export const manifestSchemaVersionSchema = z.literal(
  INSTALL_MANIFEST_SCHEMA_VERSION,
);

export const desktopErrorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "UNSUPPORTED_API_VERSION",
  "UNSUPPORTED_MANIFEST_VERSION",
  "AUTHENTICATION_REQUIRED",
  "INVALID_CREDENTIALS",
  "SESSION_EXPIRED",
  "SESSION_REVOKED",
  "ACCOUNT_DISABLED",
  "ENTITLEMENT_REQUIRED",
  "NO_COMPATIBLE_RELEASE",
  "RELEASE_RETIRED",
  "INTEGRITY_FAILURE",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
]);

export const desktopErrorSchema = z.object({
  error: z.object({
    code: desktopErrorCodeSchema,
    message: z.string().min(1),
    retryable: z.boolean(),
    request_id: z.string().min(1).optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const paginationSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  pages: z.number().int().nonnegative(),
});

export const targetSchema = z.object({
  platform: desktopPlatformSchema,
  architecture: desktopArchitectureSchema,
});

export const sessionSchema = z
  .object({
    id: identifierSchema,
    token: z.string().min(1),
    user_id: identifierSchema,
    expires_at: timestampSchema,
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .strict();

export const requestOtpSchema = z
  .object({
    login: z.string().trim().min(1),
  })
  .strict();

export const otpRequestedSchema = z
  .object({
    message: z.string().min(1),
  })
  .strict();

export const createSessionRequestSchema = z
  .object({
    login: z.string().trim().min(1),
    code: z.string().regex(/^\d{6}$/, "Code must contain exactly six digits"),
  })
  .strict();

export const catalogGameSchema = z.object({
  id: identifierSchema,
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  cover_url: z.url().nullable(),
  platforms: z.array(desktopPlatformSchema),
});

export const releaseSummarySchema = z.object({
  id: identifierSchema,
  version: z.string().min(1),
  release_number: z.number().int().positive(),
  published_at: timestampSchema,
  artifact_id: identifierSchema,
  target: targetSchema,
  compressed_size_bytes: byteSizeSchema,
  installed_size_bytes: byteSizeSchema,
  sha256: sha256Schema,
  manifest_schema_version: manifestSchemaVersionSchema,
});

export const libraryItemSchema = z.object({
  game: catalogGameSchema,
  acquired_at: timestampSchema,
  latest_compatible_release: releaseSummarySchema.nullable(),
});

const relativePathSchema = z
  .string()
  .min(1)
  .refine(
    (path) =>
      !path.startsWith("/") &&
      !path.startsWith("\\") &&
      !/^[A-Za-z]:/.test(path),
    { message: "Path must be relative" },
  )
  .refine(
    (path) =>
      !path
        .replaceAll("\\", "/")
        .split("/")
        .some((segment) => segment === ".."),
    { message: "Path must not traverse outside the installation root" },
  );

export const installManifestSchema = z.object({
  schema_version: manifestSchemaVersionSchema,
  release_id: identifierSchema,
  artifact_id: identifierSchema,
  entrypoint: relativePathSchema,
  launch_arguments: z.array(z.string()).default([]),
  working_directory: relativePathSchema.optional(),
  executables: z.array(relativePathSchema).default([]),
  environment: z.record(z.string(), z.string()).default({}),
});

export const downloadAuthorizationSchema = z.object({
  artifact_id: identifierSchema,
  url: z.url(),
  expires_at: timestampSchema,
  total_size_bytes: byteSizeSchema,
  sha256: sha256Schema,
  etag: z.string().min(1).optional(),
});

export const uploadAuthorizationSchema = z
  .object({
    url: z.url(),
    expires_at: timestampSchema,
    required_headers: z.record(z.string(), z.string()),
  })
  .strict();

export const patchFileDeclarationSchema = z
  .object({
    size_bytes: byteSizeSchema.refine((value) => BigInt(value) > BigInt(0), {
      message: "Size must be greater than zero",
    }),
    sha256: sha256Schema,
  })
  .strict();

export const releasePatchUploadRequestSchema = z
  .object({
    source_release_id: identifierSchema,
    platform: desktopPlatformSchema,
    architecture: desktopArchitectureSchema,
    algorithm: z.literal(RELEASE_PATCH_ALGORITHM),
    format_version: z.literal(RELEASE_PATCH_FORMAT_VERSION),
    patch: patchFileDeclarationSchema,
    signature: patchFileDeclarationSchema,
    expected_installation_sha256: sha256Schema,
    generation_duration_ms: byteSizeSchema,
  })
  .strict()
  .refine(
    (value) => value.expected_installation_sha256 === value.signature.sha256,
    {
      message:
        "Expected installation SHA-256 must identify the canonical target signature",
      path: ["expected_installation_sha256"],
    },
  );

export const releasePatchStatusSchema = z.enum(["PENDING", "READY", "FAILED"]);

export const releasePatchSchema = z
  .object({
    id: identifierSchema,
    source_release_id: identifierSchema,
    target_release_id: identifierSchema,
    target: targetSchema,
    algorithm: z.literal(RELEASE_PATCH_ALGORITHM),
    format_version: z.literal(RELEASE_PATCH_FORMAT_VERSION),
    status: releasePatchStatusSchema,
    patch: patchFileDeclarationSchema,
    signature: patchFileDeclarationSchema,
    expected_installation_sha256: sha256Schema,
    generation_duration_ms: byteSizeSchema,
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .strict();

export const releasePatchUploadResponseSchema = z
  .object({
    patch: releasePatchSchema,
    uploads: z
      .object({
        patch: uploadAuthorizationSchema,
        signature: uploadAuthorizationSchema,
      })
      .strict()
      .nullable(),
  })
  .strict();

export const patchFileKindSchema = z.enum(["PATCH", "SIGNATURE"]);

export const patchFileDownloadAuthorizationSchema = z
  .object({
    patch_id: identifierSchema,
    file: patchFileKindSchema,
    url: z.url(),
    expires_at: timestampSchema,
    total_size_bytes: byteSizeSchema,
    sha256: sha256Schema,
    etag: z.string().min(1).optional(),
  })
  .strict();

export const patchDownloadAuthorizationsSchema = z
  .object({
    patch: patchFileDownloadAuthorizationSchema,
    signature: patchFileDownloadAuthorizationSchema,
  })
  .strict();

export const updateReleaseIdentitySchema = z
  .object({
    id: identifierSchema,
    version: z.string().min(1),
    release_number: z.number().int().positive(),
  })
  .strict();

export const fullUpdateReasonSchema = z.enum([
  "NO_PATCH",
  "SOURCE_NOT_PREDECESSOR",
  "SOURCE_UNAVAILABLE",
  "PATCH_NOT_READY",
  "PATCH_EXCEEDS_SIZE_LIMIT",
]);

const updatePlanBaseSchema = z.object({
  source: updateReleaseIdentitySchema,
  target: releaseSummarySchema,
  fallback_artifact_id: identifierSchema,
});

export const patchUpdatePlanSchema = updatePlanBaseSchema
  .extend({
    strategy: z.literal("PATCH"),
    patch: releasePatchSchema,
  })
  .strict();

export const fullUpdatePlanSchema = updatePlanBaseSchema
  .extend({
    strategy: z.literal("FULL"),
    reason: fullUpdateReasonSchema,
  })
  .strict();

export const updatePlanSchema = z.discriminatedUnion("strategy", [
  patchUpdatePlanSchema,
  fullUpdatePlanSchema,
]);

export type DesktopPlatform = z.infer<typeof desktopPlatformSchema>;
export type DesktopArchitecture = z.infer<typeof desktopArchitectureSchema>;
export type DesktopError = z.infer<typeof desktopErrorSchema>;
export type RequestOtpRequest = z.infer<typeof requestOtpSchema>;
export type OtpRequested = z.infer<typeof otpRequestedSchema>;
export type DesktopSession = z.infer<typeof sessionSchema>;
export type CatalogGame = z.infer<typeof catalogGameSchema>;
export type LibraryItem = z.infer<typeof libraryItemSchema>;
export type ReleaseSummary = z.infer<typeof releaseSummarySchema>;
export type InstallManifest = z.infer<typeof installManifestSchema>;
export type DownloadAuthorization = z.infer<typeof downloadAuthorizationSchema>;
export type ReleasePatch = z.infer<typeof releasePatchSchema>;
export type ReleasePatchUploadRequest = z.infer<
  typeof releasePatchUploadRequestSchema
>;
export type PatchDownloadAuthorizations = z.infer<
  typeof patchDownloadAuthorizationsSchema
>;
export type UpdatePlan = z.infer<typeof updatePlanSchema>;
