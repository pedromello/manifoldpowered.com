import bcrypt from "bcryptjs";

const hash = async (password: string) => {
  const rounds = getNumberOfRounds();
  return bcrypt.hash(password, rounds);
};

const compare = async (password: string, hash: string) => {
  return bcrypt.compare(password, hash);
};

const getNumberOfRounds = () => {
  let rounds = 1;

  if (process.env.NODE_ENV === "production") {
    rounds = 14;
  }

  return rounds;
};

const password = { hash, compare };

export default password;
