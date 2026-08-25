import type { AppProps } from "next/app";
import { Analytics } from "@vercel/analytics/next";
import "../styles/global.css";

import { ReactElement, ReactNode } from "react";
import { NextPage } from "next";
import Head from "next/head";
import { PullToRefresh } from "components/PullToRefresh";
import { I18nProvider } from "lib/i18n";

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
  const getLayout = Component.getLayout ?? ((page) => page);

  return (
    <I18nProvider>
      <Head>
        <meta name="theme-color" content="#fffbf6" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1"
        />
      </Head>
      {getLayout(<Component {...pageProps} />)}
      <PullToRefresh />
      <Analytics />
    </I18nProvider>
  );
}
