import { User } from "generated/prisma/client";

function can(user: Partial<User>, feature: string, resource?: unknown) {
  let authorized = false;

  if (user.features?.includes(feature)) {
    authorized = true;
  }

  if (feature === "update:user" && resource) {
    const userResource = resource as User;
    authorized = user.id === userResource.id;
  }

  return authorized;
}

const authorization = {
  can,
};

export default authorization;
