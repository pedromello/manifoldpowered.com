import { User } from "generated/prisma/client";

function can(user: Partial<User>, feature: string) {
  return user.features?.includes(feature);
}

const authorization = {
  can,
};

export default authorization;
