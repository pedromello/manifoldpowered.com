import {
  Html,
  Head,
  Main,
  NextScript,
  type DocumentProps,
} from "next/document";

export default function Document({ __NEXT_DATA__ }: DocumentProps) {
  return (
    <Html lang={__NEXT_DATA__.locale ?? "en"}>
      <Head>
        <link rel="manifest" href="/site.webmanifest" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link
          rel="icon"
          type="image/png"
          sizes="192x192"
          href="/images/brand/icon-192x192.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="512x512"
          href="/images/brand/icon-512x512.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/images/brand/apple-icon.png"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
