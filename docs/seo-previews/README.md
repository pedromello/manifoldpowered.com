# Social preview review fixtures

These 1200×630 PNGs were rendered by the real `/api/og` route with representative public Manifold content. Production previews remain dynamic and deterministic.

## Selection and Outlet refresh

The selection uses the approved three-banner grid with its violet editorial panel at the bottom right. The Outlet puts its published identity and tagline above three equal editorial picks. Both preserve complete horizontal banners, with the Manifold mark inside the identity area.

- [Selection](selection-three-banners-pt-BR.png): three banners, selection title, Outlet attribution and the total public game count.
- [Outlet](outlet-three-picks-pt-BR.png): published identity, palette, avatar and three editorial picks.
- [Mobile-size comparison](selection-outlet-mobile.png): the same renders at 360 px wide.
- [Fallback review](selection-outlet-cases.png): two/no selection banners, a long Outlet name and an alternate palette.

These examples execute the production route and PNG renderer with fixture API responses and local copies of public banner/avatar assets. They verify composition, not database integration or WhatsApp's preview cache.

### Data and fallbacks

Selection banners follow public selection order; the count includes all valid public games before choosing images. Outlet banners only use `featured_source: EDITORIAL`, preserving the published order. Automatic carousel additions are excluded. The featured endpoint exposes an additive `publication` marker, which must match the public identity revision; the renderer retries a mismatch and falls back to confirmed identity alone.

At most six banner candidates are attempted in batches of three, keeping the first three successful images. Missing media produces a smaller composition without duplicated games. Missing avatars use initials. Text wraps within bounded boxes and uses ellipsis only after reaching the minimum font size. Supported published palettes and registered bespoke palettes determine Outlet colors.

Anonymous catalog lookups use an explicit US region with the requested locale, so previews do not vary by crawler location. The `social_preview=1` catalog flag does not change checkout or private preview handling. Cookies and private preview flags are never forwarded by the image route.

### URLs and cache

Selection and Outlet image URLs retain locale/publication version and add `design=2`. Composed images use a content-based ETag, including loaded image bytes, and a 60-second shared cache without `immutable`, because catalog/media dependencies can change independently of publication. A new image URL does not force sharing apps to refresh an already cached page preview immediately.

### Verification

- Unit coverage includes banner ordering/failures, revision races, public-only fetches, text bounds, region isolation, ETags and metadata URLs.
- Integration coverage validates publication boundaries, featured publication markers and 1200×630 PNG output.
- The production build exercises Edge bundling and application TypeScript. The repository's PR workflows run the complete Jest/integration and Agent CLI suites.

## Earlier review fixtures

- `home-pt-BR.png`: institutional Manifold card.
- `outlet-strategos-void-pt-BR.png`: earlier Outlet artwork, retained as a before-reference.
- `game-twisted-tower-pt-BR.png`: Twisted Tower key art with the Manifold lockup.

The game route falls back to branded gradients and content initials when remote artwork is absent, invalid, too large, slow, or outside the image host allowlist. Home and game compositions are unchanged by this refresh.
