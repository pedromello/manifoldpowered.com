# Manifold Desktop API compatibility

The desktop distribution API is versioned independently from the website API.
Its source contract is
[`docs/openapi/manifold-desktop-v1.yaml`](openapi/manifold-desktop-v1.yaml), and
its application-independent TypeScript schemas live in
[`contracts/desktop/v1.ts`](../contracts/desktop/v1.ts).

## Version negotiation

- Every desktop session request declares `api_version`. Version `1` is the only
  supported value for the v1 endpoint family.
- The server returns `UNSUPPORTED_API_VERSION` for an unknown API version. It
  must never choose a different version silently.
- Every install manifest declares `schema_version`. Schema version `1` is the
  only version understood by API v1.
- Unknown manifest versions return `UNSUPPORTED_MANIFEST_VERSION` and are never
  published or served as if they were version 1.
- Desktop clients may call an API version only when they implement every
  required field and error behavior in that version's OpenAPI document.

## Compatibility guarantees

Within API v1, the server may add optional response fields and new retryable
error codes. It will not remove fields, change their meaning or representation,
add required request fields, or add platform and architecture enum values
without publishing a new contract version. Clients must ignore unknown optional
response fields, but must reject unknown API and manifest versions.

API v1 uses RFC 3339 timestamps. Byte sizes are unsigned base-10 strings rather
than JSON numbers so 64-bit artifact sizes survive languages whose JSON number
implementation cannot represent every integer exactly. SHA-256 values use 64
lowercase hexadecimal characters.

## Supported targets

API v1 supports these target values:

| Dimension    | Values                    |
| ------------ | ------------------------- |
| Platform     | `WINDOWS`, `MAC`, `LINUX` |
| Architecture | `X86_64`, `AARCH64`       |
| Archive      | `ZIP`, `TAR_GZ`           |

Additional targets require a contract revision. A recognized target for which
a game has no published artifact returns `NO_COMPATIBLE_RELEASE`.

## Deprecation

A replacement API version must be available before v1 is deprecated. The
deprecation announcement must identify the last supported desktop client
version and provide at least 180 days between announcement and shutdown. A
client using a retired API version receives `UNSUPPORTED_API_VERSION` rather
than a response shaped like another version.

# Publisher release inventory

Authenticated publishers may call `GET /api/v1/games/:slug/releases` using the
same session cookie or bearer session accepted by the other v1 endpoints. The
caller must hold the existing `create:game_release` permission for the game's
studio: the studio owner is allowed, as is a member whose studio permission
includes that feature. A caller with the feature on their user record but no
matching studio membership receives `403`.

Optional query parameters are `page` (positive integer, default `1`) and
`limit` (positive integer, default `20`, maximum `100`). Results are ordered by
descending `release_number` and include every release state, including drafts,
processing, failed, published, and retired releases.

The response is:

```json
{
  "game": { "id": "...", "slug": "...", "title": "..." },
  "releases": [
    {
      "id": "...",
      "game_id": "...",
      "version": "1.0.0",
      "release_number": 1,
      "status": "DRAFT",
      "release_notes": "...",
      "published_at": null,
      "created_at": "...",
      "updated_at": "...",
      "artifacts": [
        {
          "id": "...",
          "platform": "WINDOWS",
          "architecture": "X86_64",
          "archive_format": "ZIP",
          "status": "PENDING",
          "compressed_size_bytes": "123",
          "installed_size_bytes": "456",
          "sha256": "...",
          "manifest_schema_version": "1",
          "manifest": { "schema_version": "1", "entrypoint": "game.exe" },
          "created_at": "...",
          "updated_at": "..."
        }
      ]
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "pages": 1 }
}
```

Artifact output is deliberately allow-listed. It excludes the storage object
key, signed URLs, upload headers, cookies, session tokens, and any manifest
environment values. The remaining manifest fields are sufficient for a client
to identify a persisted upload declaration and resume the existing upload-url
and confirm flow without relying exclusively on local history.

To return from the wizard's File or Review step to Details, the client may
call `PATCH /api/v1/games/:slug/releases/:release_id` while the release is
`DRAFT`. The JSON body accepts at least one of `version` and `release_notes`;
`release_notes: null` explicitly clears existing notes, while omitting the field
leaves them unchanged;
unknown fields are rejected. The response is the same filtered release object
returned by creation. The route uses the same `create:game_release`
owner/member authorization and returns `400` once the release has left `DRAFT`
(including processing, published, failed, or retired states); corrected
distribution data must use a new release.
