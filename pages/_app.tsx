import type { AppProps } from "next/app";
import { Analytics } from "@vercel/analytics/next";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <Analytics />
    </>
  );
}
