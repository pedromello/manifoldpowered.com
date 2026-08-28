import type { AppProps } from "next/app";
import { Analytics } from "@vercel/analytics/next";
import "../styles/global.css";

import { ReactElement, ReactNode } from "react";
import { NextPage } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { PullToRefresh } from "components/PullToRefresh";
import { I18nProvider } from "lib/i18n";
import { isNoIndexRoute } from "lib/seo";

export type NextPageWithLayout<P = Record<string, unknown>, IP = P> = NextPage<
  P,
  IP
> & {
  getLayout?: (page: ReactElement) => ReactNode;
};

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

export default function App({ Component, pageProps }: AppPropsWithLayout) {
  const router = useRouter();
  const getLayout = Component.getLayout ?? ((page) => page);

  return (
    <I18nProvider>
      <Head>
        <meta name="theme-color" content="#1d0f3b" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1"
        />
        {isNoIndexRoute(router.pathname) && (
          <meta name="robots" content="noindex, nofollow" />
        )}
      </Head>
      {getLayout(<Component {...pageProps} />)}
      <PullToRefresh />
      <Analytics />
    </I18nProvider>
  );
}
