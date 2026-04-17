export function getServerSideProps() {
  return {
    redirect: {
      destination: "/about/?audience=players",
      permanent: false,
    },
  };
}

export default function Players() {
  return null;
}
