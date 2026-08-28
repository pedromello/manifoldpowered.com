import type { GetServerSideProps } from "next";
import { defaultLocale } from "lib/locale";

export const getServerSideProps: GetServerSideProps = async ({
  locale,
  query,
}) => {
  const queryString = new URLSearchParams(
    query as Record<string, string>,
  ).toString();
  const localePrefix = locale && locale !== defaultLocale ? `/${locale}` : "";

  return {
    redirect: {
      destination: `${localePrefix}/store${queryString ? `?${queryString}` : ""}`,
      permanent: false,
    },
  };
};

export default function Home() {
  return null;
}
