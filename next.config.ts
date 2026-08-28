import { defaultLocale, locales } from "./lib/locale";

module.exports = {
  async redirects() {
    return [
      {
        source: "/favicon.ico",
        destination: "/images/brand/manifold-ico.ico",
        permanent: true,
        locale: false,
      },
    ];
  },
  i18n: {
    locales: [...locales],
    defaultLocale,
    // Country-aware routing lives in proxy.ts. Disabling the built-in
    // Accept-Language redirect prevents it from racing with geolocation.
    localeDetection: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "shared.fastly.steamstatic.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "shared.akamai.steamstatic.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "cdn.akamai.steamstatic.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "img.youtube.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
};
