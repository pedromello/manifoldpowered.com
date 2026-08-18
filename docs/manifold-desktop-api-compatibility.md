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
