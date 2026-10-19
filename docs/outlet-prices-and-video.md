# Outlet discovery: prices and featured videos

The community outlet home follows the A1 composition: compact creator identity,
curated game cards, a regional promotions shelf, and links to selections. The B2
selection page uses ordered desktop rows and single-column mobile content.

## Prices and promotions

`GamePriceBlock` shares the storefront pricing contract across featured games,
catalog cards and selections. Prices retain their provider currency; a BRL offer
is never compared with a USD base price. The promotion badge is always flat
`#FFB400` with dark text, independently of the outlet palette.

An external offer is eligible for promotion only when its current/original
prices are coherent, its percentage is an integer between 1 and 100, and its
capture is recent. `EXTERNAL_OFFER_MAX_AGE_HOURS` accepts values from 1 to 720
and defaults to 24. Older or unknown captures show a recorded-price state,
without advertising an active discount. This does not add automatic provider
refresh or promise live prices. The provider remains the purchase authority.

`GET /api/v1/stores/:slug/search?on_sale=1` resolves regional promotion eligibility
before filtering and pagination. It preserves published curation, regional
availability, search and rating constraints. Selection filters operate on the
complete eligible selection while retaining author order.

Prices are resolved from the catalog on read. Editorial publication snapshots
freeze curation, not changing provider prices. A missing price is never free.

## Featured YouTube videos

Outlets and selections each own an independent optional `featured_video_url`.
Use an HTTPS `youtube.com/watch?v=...` or `youtu.be/...` URL. The shared validator
accepts exact YouTube hosts and stores only an 11-character video ID. Arbitrary
embed HTML and third-party URLs are rejected. A social channel link or a URL in
the description does not automatically become a featured video.

The outlet uses a compact teaser with a keyboard-accessible dialog; the selection
uses an in-place hero. Both load the `youtube-nocookie.com` iframe only after a
click, retain a direct YouTube fallback, and leave the original cover composition
when no video is configured. No video is inherited from the outlet by a selection.

The owner panel supports setting, replacing, previewing and removing videos.
The same input is available in the existing CLI create/update commands:

```sh
manifold outlets update --env local --account curator --slug my-outlet \
  --revision 7 --featured-video-url https://youtu.be/g7QcidQx73s --json
manifold outlets selections update --env local --account curator \
  --slug my-outlet --selection-slug weekend --revision 3 \
  --featured-video-url https://youtu.be/g7QcidQx73s --json
```

Send `featured_video_url: null` through JSON input to remove a video. Omitting
the field on update preserves the existing video. Consult `schema <command>
--json` for the full input, and use the draft revision returned by each action,
including publication. A conflict requires a fresh read and review before retry.

Video edits affect only the working draft until explicit publication. Outlet
presentation v2 reads historical v1 presentations as video-free; historical
selection snapshots missing the field similarly normalize to null. The additive
migration adds nullable checked columns and never rewrites published editions.
SEO metadata and social images continue to use the selection cover and identity.
