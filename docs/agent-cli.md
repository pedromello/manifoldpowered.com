# Manifold agent CLI

The CLI uses the website's `/api/v1` endpoints and account permissions. It does
not require database access, server environment files or administrator credentials.

## Run and discover

```sh
npm ci
npm run cli
npm run cli:build
node tools/cli/dist/index.js --help
npm run --silent cli -- schema outlets create --json
```

The package in `tools/cli` declares the `manifold` executable. After building,
`npm link ./tools/cli` installs that command locally. Agents can also use the
built executable or `npm run --silent cli -- ...`; the `--silent` avoids npm's
own script announcements outside the CLI's JSON contract.

`schema <command> --json` describes its input, required context and stdin-only
fields. Ordinary fields accept flags (`--logo-url`, `--game-slugs`, `--revision`)
or a JSON object with API names (`logo_url`, `game_slugs`, `expected_draft_revision`).
Use `--input file.json` or `--input -` for stdin. Complex fields accept JSON.

## Environments and sessions

```sh
manifold env connect --env local
manifold env connect --env hml --url https://hml.example.test
manifold env connect --env prod
manifold env list --json
```

Local defaults to `http://localhost:3000`; an explicit loopback `--url` can use
another port. Hml requires an HTTPS origin. Production is pinned to
`https://www.manifoldpowered.com`, the production API's canonical origin.
An explicit `https://manifoldpowered.com` input is normalized to this fixed
origin before any request; activation links from either production hostname
are accepted. Sessions are bound to the canonical origin. Requests never follow
redirects, including redirects between these hostnames.

Every account/resource mutation requires `--env` and `--account`. `auth use`
selects an account for queries. Aliases use 1–64 letters, numbers, hyphens or
underscores and are bound to environment and origin.

### Parallel curator profiles

For parallel agents, create an immutable profile for each account:

```sh
manifold profiles create --name curator-coop --env hml --account curator-coop \
  --url https://hml.example.test --json
manifold users register --profile curator-coop --username curator-ia-coop \
  --email curator-coop@example.test --json
manifold auth whoami --profile curator-coop --json
manifold profiles list --json
```

An explicit `--profile` supplies its fixed environment, origin and account for
both queries and mutations. Conflicting `--env` or `--account` values are rejected.
Profile metadata, selections, journals and vault entry keys are isolated from
other profiles and the ordinary CLI configuration. `env connect --profile ...`
may check the bound origin but cannot switch it. Create a new profile when the
origin or account needs to change. Profile creation publishes a complete file
atomically and never overwrites another definition.

Each curator uses its own real signup, activation and login. For a shared mailbox,
use addresses/aliases under your control and match each recipient and request
time. Imported games stay in the shared catalog; a curator's own resources are
its account, outlets, selections, editorials and eligible reviews.

Metadata is stored in `~/.manifold-cli`, overridable with `MANIFOLD_CLI_HOME`.
Sessions are kept in the OS credential store under `com.manifoldpowered.cli`.
Passwords, OTP codes and activation links are never persisted or printed.

Without a credential store, inject an existing session using all four process
variables: `MANIFOLD_SESSION_TOKEN`, `MANIFOLD_SESSION_ENV`,
`MANIFOLD_SESSION_ORIGIN`, and `MANIFOLD_SESSION_ACCOUNT`. Their binding must
match the command context. This session is not persisted; normal login requires
a working credential store.
For an injected session used with `--profile`, also set
`MANIFOLD_SESSION_PROFILE` to that exact profile name. A profiled session is
rejected in another profile or the ordinary CLI context, even if aliases match.

## Signup and authentication

```sh
manifold users register --env local --account creator-a \
  --username creator-a --email creator-a@example.test --json
manifold users activate --env local --account creator-a \
  --mailcatcher --wait --timeout 15 --json
manifold auth whoami --env local --account creator-a --json
```

Signup defaults to `password: null`, matching the website. For hml and production,
use email addresses under your control. The agent reads the connected mailbox
and supplies `{ "activation_url": "<link from the email>" }` through stdin:

```sh
manifold users activate --env hml --account creator-a --input - --json
```

The activation link must match the selected origin. Activation saves the newly
issued session and confirms the account identity.

```sh
manifold auth login request --env hml --account creator-a \
  --login creator-a --email creator-a@example.test --json
manifold auth login verify --env hml --account creator-a \
  --login creator-a --input - --json
```

Verification receives `{ "code": "<code from the email>" }` via stdin.
`--email` is optional metadata when requesting OTP by username. Local verification
supports `--mailcatcher --wait`, matching recipient, subject and request time.
It never chooses the globally latest email.

`auth login password --input -` receives `email` and `password`. An optional
signup password likewise arrives through stdin. Never put actual passwords,
OTP codes or activation links in flags or files. `auth accounts`, `auth use`
and `auth logout` manage sessions; logout affects only the selected session.

## Games and studios

```sh
manifold studios create --env hml --account creator-a --name "Demo Studio" --json
manifold studios list --env hml --account creator-a --json
manifold games list --env hml --q adventure --json
manifold games import steam --env hml --account creator-a --reference 400 --wait --json
```

Steam accepts App IDs or store URLs. Nintendo accepts supported Brazilian or US
product-page URLs through `games import nintendo --reference <url>`. Imported
games belong to the shared catalog; importing does not assign studio ownership.

`games import batch --input games.json` accepts:

```json
{
  "games": [
    { "provider": "steam", "reference": "400" },
    { "provider": "steam", "reference": "620" }
  ]
}
```

The entire list is validated before importing. Processing is sequential, with
individual results. Repeated references use the backend's existing deduplication
and refresh policy. Asynchronous results provide an `operation_id` and
`next_action`. Resume with `games import status --provider ... --reference ...
--operation-id ...`; this polls without resubmitting. `--wait` defaults to 120
seconds and respects `Retry-After`. Creation requests are not automatically retried.
Results retain the supplied `original_reference` alongside the normalized
`reference` used for status queries. Steam URLs containing credentials are rejected.

## Personalized outlets

Create a private draft with `outlets create --input outlet.json`:

```json
{
  "name": "Cozy Discoveries",
  "description": "Games for quiet evenings and memorable stories.",
  "logo_url": "https://example.test/logo.png",
  "cover_url": "https://example.test/cover.png",
  "tagline": "Find your next favorite story",
  "layout_preset": "editorial",
  "brand_tokens": {
    "palette": "ocean",
    "typography": "editorial",
    "shape": "soft"
  },
  "social_links": { "website": "https://example.test" }
}
```

Use real HTTPS image URLs. `outlets options` lists presets and branding choices;
new outlets default to the `channel` layout and belong to the authenticated account.

`outlets catalog mode` chooses `ALL` or `SELECTED`. `outlets catalog set`
supports `HANDPICKED` (at least five games) or `FOCUSED` (one or more tags).
Input contains `slug`, `strategy`, `tags`, `game_slugs`, and the observed
`expected_draft_revision`.

`catalog set` initializes a pristine `UNDECIDED` outlet. Apply it before setting
an explicit catalog mode. The server rejects attempts to use this initializer
to replace existing curation. Maintain an existing outlet with:

- `outlets catalog list`: inspect membership, visibility source, tags and
  editorial status, with pagination and filters.
- `outlets catalog add`: create/update a `SHOW` exception; inclusion overrides
  tag blacklists.
- `outlets catalog remove`: create/update a `HIDE` exception.
- `outlets catalog reset`: delete that exception and restore tag/catalog rules.
- `outlets tags list`, `add`, `update`, `remove`, `preview`: manage explicit
  whitelist/blacklist rules and inspect their impact.
- `outlets catalog bulk preview`, `apply`: preview `SHOW`, `HIDE` or `PIN_SHOW`,
  then supply the exact payload, returned `request_fingerprint`, a fresh UUID
  `operation_id`, and the observed revision. The backend can replay the same
  operation idempotently; another payload or a stale revision fails.

Every write requires `expected_draft_revision`; the CLI does not overwrite or
retry revision conflicts. `outlets unpublish` also requires the observed revision.

`outlets featured set --input featured.json` accepts:

```json
{
  "slug": "cozy-discoveries",
  "expected_draft_revision": 2,
  "recommendations": [
    {
      "game_slug": "portal",
      "recommendation_reason": "A clever and memorable puzzle adventure."
    }
  ]
}
```

Replace the example revision and slugs with the current values. Identity updates,
catalog selection and Featured changes require an observed draft revision.
Identity uses `If-Match`; other commands send `expected_draft_revision`. Conflicts
require reading and reviewing the current draft and are never silently retried.

```sh
manifold outlets readiness --env hml --account creator-a --slug cozy-discoveries --json
manifold outlets preview --env hml --account creator-a --slug cozy-discoveries --json
manifold outlets publish --env hml --account creator-a --slug cozy-discoveries --revision 3 --json
```

Publication follows server readiness: description and logo, explicit visual
identity, intentional catalog with five eligible games, and one to three valid
Featured recommendations. Success returns the public URL and publication
revision. Subsequent draft edits remain private until republished.

## Editorials, account reviews and discovery

```sh
manifold outlets editorial set --profile curator-coop --input editorial.json --json
manifold outlets editorial get --profile curator-coop --slug cozy-discoveries \
  --game-slug portal --json
manifold outlets verify --profile curator-coop --slug cozy-discoveries --json
manifold outlets discover --env hml --q cozy --json
```

An editorial input contains `slug`, `game_slug`, optional `headline` (120
characters), `body` (1–2,000 characters), and `expected_draft_revision`.
`editorial get` reads the private draft; `set` and `remove` edit it. Editorials
are captured in immutable publication revisions and are separate from community
review scores. `outlets public` reads the public snapshot anonymously.

Use clearly identified AI curator accounts. Write useful, source-supported
recommendations and explain their basis; do not invent personal play experience.

`reviews list` reports the account's current review, `can_review`, pagination and
the game's aggregate summary. `reviews create` and `update` accept `slug`,
`message` (1–3,000 characters), and `recommended` (boolean); `remove` deletes
only that account's review. Creation/update check server eligibility first.
External display-only games are reviewable; platform games require ownership
in the library. These reviews affect the public score, unlike outlet editorials.

`library list` and `library has --slug ...` are read-only. There is no acquisition
command: acquiring a platform game creates a sale, so it is outside curator
population tasks. `wishlist status`, `add`, and `remove` manage supported platform
games. External imports use their provider's wishlist and the API rejects an
internal wishlist addition. `outlets followed`, `follow`, and `unfollow` use
the normal account permissions for published outlets.

`outlets verify` returns server readiness, publication/draft revisions, catalog
and editorial counts, and duplicate editorial warnings. `--check-images`
additionally checks logo/cover availability without sending session cookies or
following redirects; private/loopback image hosts are rejected. This is an
availability check, not a visual-quality judgment. Without the flag, images
are explicitly reported as not checked. Blocking issues return exit `1` with
the completed report; warnings remain exit `0`.

## Execution records and recovery

Resource mutations return an `execution_id`. Their local journals retain
account/origin, timestamps, state, resource identifiers, URLs and resumable import
references. They never store original inputs, content bodies, passwords, OTPs,
activation links, email addresses or session responses. Authentication and
profile setup are not journaled. Every import response is checkpointed, including
accepted asynchronous operation IDs, before waiting for the next status.

```sh
manifold runs list --profile curator-coop --json
manifold runs get --profile curator-coop --execution-id UUID --json
manifold runs resume --profile curator-coop --execution-id UUID --wait --json
```

Resume polls recorded imports using GET; it never resubmits creation or editing
requests. Inspect existing resources before repeating an interrupted or
indeterminate mutation. Network errors, malformed mutation responses, server
failures and mutation precondition responses are not advertised as safe retries.
If an outlet edit succeeds but its follow-up readiness read fails, the result
remains completed with `mutation_outcome: "applied"` and a `next_action` to read
`outlets readiness`. Repeat the read, not the accepted edit.
Journals are scoped to their profile/environment/origin/account and cannot be
read or resumed through another account's context.

## Agent output and visual opening

JSON stdout is a single versioned object with `command`, `environment`, `account`,
`state`, `data`, `error`, and `next_action`. Plain progress goes to stderr.
Resource results also contain `profile` and `execution_id` when applicable.
Exit codes: `0` accepted/completed, `1` failure or partial batch failure,
`2` invalid input, `3` pending work after a timeout. Signup and OTP requests
return `pending` with exit `0` because the request was accepted.

Interactive startup ports the desktop emblem geometry, Unicode wordmark,
magenta/violet gradient and shadows. It adapts to terminal width and supports
`--no-banner`, `NO_COLOR` and `TERM=dumb`. JSON and redirected output suppress
branding in both streams. Rendering uses no external images, network or extra window.

## Verification

Local signup and OTP requests capture Mailcatcher's latest message ID when it is
available. Automatic verification filters newer IDs, recipient, message type and
request time; Mailcatcher's UTC timestamps without a suffix are interpreted as
UTC with second precision. This excludes older codes even within the same second.

```sh
npm run cli:typecheck
npm run cli:build
npm run cli:test
npm run services:up
npm run prisma:generate
npm run cli:test:e2e
```

The end-to-end test creates and drops a fresh `cli_e2e_<timestamp>` database on
loopback Postgres, starts Next on port 3031, and uses Mailcatcher. It never resets
the ordinary development database or deletes unrelated emails. Synthetic provider
snapshots are seeded through real import models; CLI commands exercise the cached
Steam/Nintendo API path. Unit tests cover fresh asynchronous imports and failures.
Windows sandboxed runners may require permission for local services and atomic
file renames. Tests keep their credentials in memory, outside the OS vault.
The second real HTTP flow runs three curator profiles simultaneously, including
activation/OTP, the same cached provider import, independent outlets, editorials,
catalog/tag/bulk maintenance, publication snapshots, eligible/ineligible reviews,
wishlists, follows, journals, and isolated logout. It does not acquire paid games.
