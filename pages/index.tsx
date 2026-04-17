export function getServerSideProps() {
  return {
    redirect: {
      destination: "/about",
      permanent: false,
    },
  };
}

export default function Home() {
  return null;
}
