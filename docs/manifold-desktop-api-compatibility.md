# Manifold distribution API compatibility

Release distribution is part of the same API consumed by the website, desktop
application, and any future clients. Its source contract is
[`docs/openapi/manifold-desktop-v1.yaml`](openapi/manifold-desktop-v1.yaml), and
its application-independent TypeScript schemas live in
[`contracts/desktop/v1.ts`](../contracts/desktop/v1.ts).

## Version negotiation

- The API version is explicit in the `/api/v1` path. Clients do not send a
  second, client-specific version field during authentication.
- Requests for an unknown API version fail rather than silently selecting
  another version.
- Every install manifest declares `schema_version`. Schema version `1` is the
  only version understood by API v1.
- Unknown manifest versions return `UNSUPPORTED_MANIFEST_VERSION` and are never
  published or served as if they were version 1.
- Clients may call an API version only when they implement every required field
  and error behavior in that version's OpenAPI document.

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

Authentication uses the platform's existing passwordless OTP flow and opaque
server-side sessions. The API sets the session in the secure, HTTP-only
`session_id` cookie. API v1's existing session representation also contains the
opaque token for backward compatibility, so clients must treat the response as
sensitive. The Tauri native HTTP layer owns the cookie jar and must not expose
the cookie or token field to its WebView.

## Supported targets

API v1 supports these target values:

| Dimension    | Values                    |
| ------------ | ------------------------- |
| Platform     | `WINDOWS`, `MAC`, `LINUX` |
| Architecture | `X86_64`, `AARCH64`       |
| Archive      | `ZIP`                     |

Additional targets require a contract revision. A recognized target for which
a game has no published artifact returns `NO_COMPATIBLE_RELEASE`.

The Desktop MVP publishes and resolves ZIP artifacts only. The database keeps
the legacy `TAR_GZ` value for migration compatibility, but publisher upload
requests reject it until the installer implements that extraction format.

## Deprecation

A replacement API version must be available before v1 is deprecated. The
deprecation announcement must identify affected clients and provide at least
180 days between announcement and shutdown. A client using a retired API
version receives an explicit version error rather than a response shaped like
another version.
