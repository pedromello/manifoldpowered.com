export function getServerSideProps() {
  return {
    redirect: {
      destination: "/about/?audience=developers",
      permanent: false,
    },
  };
}

export default function Developers() {
  return null;
}
