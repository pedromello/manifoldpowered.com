# Social preview review fixtures

These 1200×630 PNGs were rendered by the real `/api/og` route with representative public Manifold content. Production previews remain dynamic and deterministic.

## Selection and Outlet refresh

The selection keeps the approved three-banner grid, with its Outlet's published palette, avatar and name in the bottom-right editorial panel. The title follows the Outlet identity; the game count and a quiet `via Manifold` signature sit in the footer. The Outlet preview puts its published identity and tagline above three equal editorial picks. Both preserve complete horizontal banners.

- [Branded selection](selection-outlet-branded-pt-BR.png): the approved grid with a crimson identity and a representative CN avatar based on the supplied reference. Game artwork is reused from the earlier review fixture and does not represent the live Nintendo selection.
- [Published palettes](selection-outlet-branded-palettes.png): all five standard palettes and two registered bespoke identities, at 360 px wide.
- [Branded fallbacks](selection-outlet-branded-cases.png): zero to three banners, initials, long text and an older payload without palette fields.
- [Mobile identity comparison](selection-outlet-mobile-comparison.png): before/after at actual 320 px and 360 px widths. The avatar grows from 64 to 112 source pixels and the Outlet name from 28 to 40, with up to two lines. The selection title remains the primary text, with a larger font and more width than the Outlet name.

Regenerate and verify these offline with `npx tsx tests/visual/selection-social-preview.tsx`. The runner executes the real image route and PNG renderer with fixture API responses, checks the 1200×630 output and samples the editorial panel's actual pixel color. Unit tests also verify small-text contrast across all supported identities.

### Previous composition

- [Selection](selection-three-banners-pt-BR.png): three banners, selection title, Outlet attribution and the total public game count.
- [Outlet](outlet-three-picks-pt-BR.png): published identity, palette, avatar and three editorial picks.
- [Mobile-size comparison](selection-outlet-mobile.png): the same renders at 360 px wide.
- [Fallback review](selection-outlet-cases.png): two/no selection banners, a long Outlet name and an alternate palette.

These examples execute the production route and PNG renderer with fixture API responses and local copies of public banner/avatar assets. They verify composition, not database integration or WhatsApp's preview cache.

### Data and fallbacks

Selection banners follow public selection order; the count includes all valid public games before choosing images. The selection response includes additive `brand_tokens` and `theme_key` fields from the same published Outlet projection as its name and logo, without another identity fetch. Private draft edits do not supply the public palette. Outlet banners only use `featured_source: EDITORIAL`, preserving the published order. Automatic carousel additions are excluded. The featured endpoint exposes an additive `publication` marker, which must match the public identity revision; the renderer retries a mismatch and falls back to confirmed identity alone.

At most six banner candidates are attempted in batches of three, keeping the first three successful images. Missing media produces a smaller composition without duplicated games. Missing avatars use initials. Text wraps within bounded boxes and uses ellipsis only after reaching the minimum font size. Supported published palettes and registered bespoke palettes determine Outlet colors.

Selection panels use the published palette's accent/foreground pair, or its explicit `socialPanel` pair where the brand needs a saturated editorial surface or higher small-text contrast. No Outlet name or slug selects a color. Unknown/missing palette tokens use the default palette. Avatar loading reuses the existing bounded, allowlisted raster loader and registered identity assets; unavailable or unsupported logos fall back to Outlet initials.

Anonymous catalog lookups use an explicit US region with the requested locale, so previews do not vary by crawler location. The `social_preview=1` catalog flag does not change checkout or private preview handling. Cookies and private preview flags are never forwarded by the image route.

### URLs and cache

Selection and Outlet image URLs retain locale/publication version and add `design=5`. Composed images use a content-based ETag, including Outlet identity and loaded image bytes, and a 60-second shared cache without `immutable`, because catalog/media dependencies can change independently of publication. A new image URL does not force sharing apps to refresh an already cached page preview immediately.

### Verification

- Unit coverage includes banner ordering/failures, revision races, public-only fetches, text bounds, region isolation, ETags and metadata URLs.
- Integration coverage validates publication boundaries, featured publication markers and 1200×630 PNG output.
- The production build exercises Edge bundling and application TypeScript. The repository's PR workflows run the complete Jest/integration and Agent CLI suites.

## Earlier review fixtures

- `home-pt-BR.png`: institutional Manifold card.
- `outlet-strategos-void-pt-BR.png`: earlier Outlet artwork, retained as a before-reference.
- `game-twisted-tower-pt-BR.png`: Twisted Tower key art with the Manifold lockup.

The game route falls back to branded gradients and content initials when remote artwork is absent, invalid, too large, slow, or outside the image host allowlist. Home and game compositions are unchanged by this refresh.
