import type { AppProps } from "next/app";
import { Analytics } from "@vercel/analytics/next";
import "../app/global.css";

import { ReactElement, ReactNode } from "react";
import { NextPage } from "next";
import Head from "next/head";

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
    <>
      <Head>
        <meta name="theme-color" content="#fffbf6" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1"
        />
      </Head>
      {getLayout(<Component {...pageProps} />)}
      <Analytics />
    </>
  );
}
