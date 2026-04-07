import { User } from "generated/prisma/client";

function can(user: Partial<User>, feature: string, resource?: unknown) {
  let authorized = false;

  if (user.features?.includes(feature)) {
    authorized = true;
  }

  if (feature === "update:user" && resource) {
    authorized = false;
    const userResource = resource as User;

    if (user.id === userResource.id || can(user, "update:user:others")) {
      authorized = true;
    }
  }

  return authorized;
}

const authorization = {
  can,
};

export default authorization;
