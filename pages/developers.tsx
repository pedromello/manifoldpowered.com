export function getServerSideProps() {
  return {
    redirect: {
      destination: "/?audience=developers",
      permanent: false,
    },
  };
}

export default function Developers() {
  return null;
}
