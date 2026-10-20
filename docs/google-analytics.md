# Google Analytics

The site uses GA4 alongside the existing Vercel Analytics integration.
The production measurement ID is `G-VTZ55HBZVP`, for the **Manifold Web** stream
on `https://www.manifoldpowered.com` in the **Manifold** property (`559826194`).
The reporting time zone is São Paulo and the currency is BRL.
This ID is public, not a credential; no Google API key or service account is needed.
`NEXT_PUBLIC_GOOGLE_ANALYTICS_ID` can override the ID at build time. An empty
or invalid override disables the tag.

`components/GoogleAnalytics.tsx`, mounted once in `pages/_app.tsx`, loads
`gtag.js` through `next/script` after hydration. It runs only in a production
build on `manifoldpowered.com` or `www.manifoldpowered.com`. Development,
localhost and Vercel preview domains do not send events.

## Web stream settings

**Enhanced measurement is off** for this stream and must remain off. Page views are sent by the
application on initial navigation and subsequent Next.js route changes, with
`send_page_view: false` on initialization. Enabling history-based automatic
page views would double-count navigations. Automatic search, form, outbound
link and download measurement must remain disabled so those events cannot
forward raw URLs or form metadata outside this adapter.

The adapter removes query strings and fragments, replaces private dynamic
route identifiers and draft preview paths with their Next.js route templates, and limits the initial
referrer to its origin. Public game, Outlet and selection paths remain available
for page reports. Navigations that change only query strings or fragments do
not create another view. UTM parameters are intentionally omitted with the
rest of the query string. Google Signals and ad personalization are disabled
in the tag configuration.

## Verify after deployment

1. Open the production site with browser tracking blockers disabled for the test.
2. Check that `gtag/js` loads with the correct measurement ID and GA4 collection
   requests return successfully.
3. Navigate between two pages using internal links; confirm one `page_view`
   per page, with sanitized `page_location` and `page_referrer` values.
4. Open GA4's Realtime report and confirm the visit arrives. A configured stream
   alone does not prove the production deployment is collecting data.

References: [Next.js scripts](https://nextjs.org/docs/pages/guides/scripts),
[Google page views](https://developers.google.com/analytics/devguides/collection/ga4/views).
