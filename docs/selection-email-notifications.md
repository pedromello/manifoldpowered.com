# New selection email notifications

The outlet bell subscribes a signed-in user to future selections from that outlet. Enabling it also follows the outlet; disabling it keeps the follow, and unfollowing disables the subscription. Existing followers start unsubscribed. A confirmed email address is required. There are no historical email sends when enabling the bell.

The first opt-in initializes a single user-wide email language from the current site locale (`pt-BR` or `en`, otherwise `en`). Later browsing language changes do not change it. Users can change it under notification preferences. Email subjects, interface copy, and links are localized; curator titles and descriptions remain in their original language.

## Publication and delivery

Only a selection's **first public publication** creates an event. Event creation commits with publication, with a unique event per selection. Edits, price changes, reordering, republication, changing the slug, and withdrawing then publishing again produce no new email event. Delivery rows are unique per event/user, and the database owns all leases, frozen payloads, due times, and terminal states.

After commit, the application publishes an ID-only message to `selection-email-fanout`. Fan-out pages subscriptions that existed when publication occurred and schedules batches on `selection-email-send`. Workers recheck subscription consent, verified address, follow, account status, and public visibility before first sending. At most three games appear in published order. No prices, embedded video, open-tracking pixel, or other recipients appear in the email.

Vercel Queues delivery is at least once. The handlers use `QueueClient.handleNodeCallback` for the Pages Router; `vercel.json` registers private `queue/v2beta` triggers. Messages retain for seven days. Retries back off and honor provider `Retry-After`. A delivery-count threshold alone never discards work; permanent or expired-uncertain work must first become terminal in the database.

The sender, recipient, subject, HTML, text, unsubscribe headers, order, and provider idempotency key must be frozen together. Resend accepts up to 100 individual emails per batch. The database enforces a global initial limit of one batch per second. A retry resends the exact stored request body and key. Resend retains idempotency keys for 24 hours; results still uncertain after 23 hours are quarantined for investigation rather than sent with a new key.

An explicit daily budget controls **new recipient admissions**, not API attempts. Before freezing a new request, the worker reserves recipient capacity in a database row keyed by the UTC date. If only part of a batch fits, it admits that part and defers the remaining recipients until the next UTC day. Repeating an already-reserved immutable request does not charge the budget again, including safe replacements after a known rejection. Delayed sends and retries can cross UTC midnight, so this is not a promise about the provider's billed send count on each date. Set the budget below the provider allowance and leave separate headroom for authentication emails and other traffic. Production defaults to zero: a positive explicit budget and the feature switch are both required.

An HTTP success is provider acceptance, not delivery. Signed Resend webhooks record delivery and permanently suppress addresses after hard bounces or complaints. The webhook endpoint reads the raw body with a 256 KiB cap, verifies the signature before any processing, and deduplicates the signed event ID. Never log raw webhook payloads, email content, unsubscribe tokens, recipients, or provider error bodies.

Unsubscribe works without a login using a signed outlet-specific token. The human footer link uses a URL fragment (`/{locale}/notifications/unsubscribe#token=...`), keeping its token out of the initial HTTP request and referrer. The page reads the fragment and submits a secure POST only after confirmation; opening it by GET never changes the subscription. Separately, RFC 8058 `List-Unsubscribe` uses `/api/v1/notifications/unsubscribe?token=...` with `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, allowing mail clients to perform their standard POST without a login. GET on that API does not unsubscribe. Do not log query strings on this endpoint. Already-accepted messages cannot be recalled. The footer also links to signed-in preference management.

## Runtime configuration

| Variable                                 | Purpose                                                                                                                                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OUTLET_SELECTION_EMAILS_ENABLED`        | `true` explicitly enables processing. Defaults off everywhere.                                                                                                                                                                 |
| `SELECTION_EMAIL_DAILY_LIMIT`            | Maximum new recipient reservations per UTC date. Defaults to `0` in production and `10000` outside production; production requires an explicit positive value. Retries reuse their existing reservation.                       |
| `SELECTION_EMAIL_UNSUBSCRIBE_SECRET`     | Server-only signing key of at least 32 characters. Required in production; development has a local-only fallback. Keep stable so existing footer and one-click links remain valid.                                             |
| `MANIFOLD_SELECTION_EMAIL_ORIGIN`        | Canonical origin for links and the official `/images/brand/manifold-logo.png` asset. Defaults to the production site; loopback HTTP is permitted only outside production.                                                      |
| `EMAIL_FROM`                             | Verified Resend sender, plain address or display-name/address form. No new sender identity is provisioned by this feature.                                                                                                     |
| `RESEND_API_KEY`                         | Server-only sending credential.                                                                                                                                                                                                |
| `RESEND_WEBHOOK_SECRET`                  | Signing secret for `/api/webhooks/resend`; subscribe to delivery, bounce, and complaint events.                                                                                                                                |
| `CRON_SECRET`                            | Required bearer secret for the recovery endpoint.                                                                                                                                                                              |
| `OUTLET_SELECTION_EMAIL_TRANSPORT`       | Production uses Resend; an SMTP override is rejected because this local sink does not implement Resend API batch idempotency. Defaults to local SMTP elsewhere. `resend` outside production also requires the allowlist below. |
| `OUTLET_SELECTION_EMAIL_TEST_RECIPIENTS` | Comma-separated exact test recipient addresses allowed for external sending outside production. Empty means no external sends.                                                                                                 |
| `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`     | Local SMTP sink; defaults `127.0.0.1:1025`. Nonproduction SMTP is restricted to loopback or the local `mailcatcher`/`mailpit` services.                                                                                        |

Secrets must be configured directly in the deployment environment, never committed or printed. Keep previews disabled by default. No paid plan or quota is changed automatically.

Disable both open tracking and click tracking on the verified Resend sending domain before rollout. The template adds no tracking pixel itself; provider domain settings can still inject a pixel or rewrite links. This implementation does not change those account settings automatically. Check an actual controlled-recipient message for the original destination URLs and absence of a provider tracking pixel. [Resend tracking guidance](https://resend.com/blog/introducing-custom-tracking-domain).

The daily recovery GET `/api/internal/selection-emails/recover` runs at **08:15 UTC** with a constant-time `CRON_SECRET` check. It repairs pending enqueue and retry work from the database. The existing retention cron remains unchanged. Hobby cron is daily and has limited timing precision; regular dispatch happens through Queues, while exceptional missed work may wait until the following day's recovery. Queue operation usage and Resend email allowances are separate limits.

## Validation and rollout

1. Apply migrations and generate the client in an isolated local database. Keep external sending disabled.
2. Exercise signup/OTP, language changes, follow/bell/unfollow, first publication, repeated publication, consent cancellation, and account isolation. Inspect both text and HTML in Mailcatcher.
3. Simulate 10,000 subscribers with a controlled transport; verify bounded pages, one-second global admission, stable retry bodies, unique deliveries, and recovery after interruption.
4. Configure verified sender with open/click tracking disabled, signed webhooks, queue triggers, cron secret, canonical origin, a positive daily budget with authentication headroom, and an unsubscribe signing secret of at least 32 characters. Validate Gmail/Outlook layout using allowlisted controlled recipients only.
5. Enable for controlled accounts before opening general subscriptions. Monitor pending count/oldest age, terminal failures, uncertain batches, accepted/delivered counts, hard bounces, complaints, and unsubscribes. Pause the feature to stop new processing if delivery health degrades; retain durable state for investigation and recovery.

## Provider references

- [Vercel Queues SDK](https://vercel.com/docs/queues/sdk): Pages Router callbacks, retention, retry behavior.
- [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing): Hobby scheduling limits.
- [Resend batch API](https://resend.com/docs/api-reference/emails/send-batch-emails): individual batch messages.
- [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys): 24-hour key window.
- [Resend signature verification](https://resend.com/docs/webhooks/verify-webhooks-requests): raw body and signed headers.
