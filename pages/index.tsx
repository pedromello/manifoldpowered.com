import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async ({ query }) => {
  const queryString = new URLSearchParams(
    query as Record<string, string>,
  ).toString();
  return {
    redirect: {
      destination: `/about${queryString ? `?${queryString}` : ""}`,
      permanent: false,
    },
  };
};

export default function Home() {
  return null;
}
