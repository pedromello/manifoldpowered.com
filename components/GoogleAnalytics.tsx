import { useEffect, useRef } from "react";
import Script from "next/script";
import { useRouter } from "next/router";
import {
  GOOGLE_ANALYTICS_ID,
  analyticsPageLocation,
  analyticsReferrer,
  isAnalyticsEnabled,
  isPrivateAnalyticsRoute,
} from "lib/google-analytics";

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

export function GoogleAnalytics() {
  const router = useRouter();
  const enabled =
    typeof window !== "undefined" &&
    isAnalyticsEnabled(
      window.location.hostname,
      process.env.NODE_ENV,
      GOOGLE_ANALYTICS_ID,
    );
  const initialized = useRef(false);
  const previousLocation = useRef<string | null>(null);

  useEffect(() => {
    if (!router.isReady || !enabled) {
      return;
    }

    window.dataLayer ??= [];
    window.gtag ??= function () {
      // gtag.js expects the standard arguments object in its command queue.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer.push(arguments);
    };

    const pageLocation = analyticsPageLocation(router.asPath, router.pathname);
    if (pageLocation === previousLocation.current) return;

    const page = {
      page_location: pageLocation,
      page_title: isPrivateAnalyticsRoute(router.pathname)
        ? router.pathname
        : document.title,
      page_referrer:
        previousLocation.current ?? analyticsReferrer(document.referrer),
    };
    window.gtag("set", page);

    if (!initialized.current) {
      window.gtag("js", new Date());
      window.gtag("config", GOOGLE_ANALYTICS_ID, {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      });
      initialized.current = true;
    }

    window.gtag("event", "page_view", page);
    previousLocation.current = pageLocation;
  }, [enabled, router.isReady, router.asPath, router.pathname]);

  if (!enabled) return null;

  return (
    <Script
      id="google-analytics"
      src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`}
      strategy="afterInteractive"
    />
  );
}
