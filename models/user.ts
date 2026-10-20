import { prisma } from "infra/database";
import password from "models/password";
import { NotFoundError, ValidationError } from "infra/errors";
import { z } from "zod";
import authorization from "models/authorization";
import { Prisma } from "generated/prisma/client";
import { lockEmailIdentity, normalizeEmail } from "models/email_identity";

import { userSchema, userUpdateSchema } from "contracts/creator-requests";
export { userSchema };

export const userAdminQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  q: z.string().optional(),
});

export type CreateUserDto = z.infer<typeof userSchema> & {
  features?: string[];
};

type UpdateUserDto = z.infer<typeof userUpdateSchema>;

const create = async (createUserDto: CreateUserDto) => {
  await validateUniqueEmail(createUserDto.email);
  await validateUniqueUsername(createUserDto.username);
  await hashPasswordInObject(createUserDto);

  return prisma.user.create({
    data: {
      username: createUserDto.username.toLowerCase().trim(),
      email: createUserDto.email.toLowerCase().trim(),
      password: createUserDto.password,
      // The public signup schema rejects features. Internal callers may set them.
      features: createUserDto.features ?? ["read:activation_token"],
    },
  });
};

const validateUniqueEmail = async (email: string) => {
  const foundUser = await prisma.user.findUnique({
    where: {
      email: email.toLowerCase().trim(),
    },
  });

  if (foundUser) {
    throw new ValidationError({
      message: `User with email ${email} already exists`,
      action: "Try another email",
    });
  }

  return true;
};

const validateUniqueUsername = async (username: string) => {
  const foundUser = await prisma.user.findUnique({
    where: {
      username: username.toLowerCase().trim(),
    },
  });

  if (foundUser) {
    throw new ValidationError({
      message: `User with username ${username} already exists`,
      action: "Try another username",
    });
  }

  return true;
};

const hashPasswordInObject = async (userDto: CreateUserDto | UpdateUserDto) => {
  if (!userDto.password) {
    return userDto;
  }

  const hashedPassword = await password.hash(userDto.password);
  userDto.password = hashedPassword;

  return userDto;
};

const findOneByUsername = async (username: string) => {
  const user = await prisma.user.findUnique({
    where: {
      username: username.toLowerCase(),
    },
  });

  if (!user) {
    throw new NotFoundError({
      message: `User with username ${username} not found`,
      action: "Try another username",
    });
  }

  return user;
};

const findOneByEmail = async (email: string) => {
  const user = await prisma.user.findUnique({
    where: {
      email: email.toLowerCase(),
    },
  });

  if (!user) {
    throw new NotFoundError({
      message: `User with email ${email} not found`,
      action: "Try another email",
    });
  }

  return user;
};

// Resolves a login identifier to a user: treated as an email when it contains
// "@", otherwise as a username. Reuses the existing finders, so it throws the
// same NotFoundError they do when nothing matches. Used by the passwordless
// login flow so users can sign in with either their username or their email.
const findOneByLogin = async (login: string) => {
  const normalizedLogin = login.trim();

  if (normalizedLogin.includes("@")) {
    return findOneByEmail(normalizedLogin);
  }

  return findOneByUsername(normalizedLogin);
};

const findOneById = async (id: string) => {
  const user = await prisma.user.findUnique({
    where: {
      id,
    },
  });

  if (!user) {
    throw new NotFoundError({
      message: `User with id ${id} not found`,
      action: "Try another id",
    });
  }

  return user;
};

const updateByUsername = async (
  username: string,
  userUpdateDto: UpdateUserDto,
) => {
  const input = parseUserUpdate(userUpdateDto);
  const existingUser = await findOneByUsername(username);
  if (input.username && input.username !== existingUser.username) {
    await validateUniqueUsername(input.username);
  }

  if (input.email && input.email !== normalizeEmail(existingUser.email)) {
    await validateUniqueEmail(input.email);
  }

  return update(existingUser.id, input);
};

function parseUserUpdate(value: unknown) {
  const result = userUpdateSchema.safeParse(value);
  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Only username, email and password can be updated here",
    });
  }
  return result.data;
}

const update = async (id: string, userUpdateDto: UpdateUserDto) => {
  const input = parseUserUpdate(userUpdateDto);
  const hashedPassword = input.password
    ? await password.hash(input.password)
    : undefined;
  return prisma.$transaction(async (tx) => {
    const identity = await lockEmailIdentity(tx, id);
    const emailChanged =
      input.email !== undefined &&
      input.email !== normalizeEmail(identity.email);
    const updatedUser = await tx.user.update({
      where: { id },
      data: {
        ...(input.username !== undefined ? { username: input.username } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(hashedPassword !== undefined ? { password: hashedPassword } : {}),
        ...(emailChanged
          ? {
              verified_email: null,
              email_verified_at: null,
              email_version: { increment: 1 },
            }
          : {}),
      },
    });
    if (emailChanged) {
      const now = new Date();
      await tx.userActivationToken.updateMany({
        where: { user_id: id, used_at: null },
        data: { used_at: now },
      });
      await tx.userOtp.updateMany({
        where: { user_id: id, used_at: null },
        data: { used_at: now },
      });
    }
    return updatedUser;
  });
};

const setFeatures = async (id: string, features: string[]) => {
  const updatedUser = await prisma.user.update({
    where: {
      id,
    },
    data: {
      features,
    },
  });

  return updatedUser;
};

const addFeatures = async (id: string, features: string[]) => {
  const user = await findOneById(id);
  const updatedUser = await prisma.user.update({
    where: {
      id,
    },
    data: {
      features: [...new Set([...user.features, ...features])],
    },
  });

  return updatedUser;
};

const findAllPaginated = async ({
  page = 1,
  limit = 20,
  q,
}: {
  page?: number;
  limit?: number;
  q?: string;
}) => {
  const where: Prisma.UserWhereInput = {};

  if (q) {
    where.OR = [
      { username: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

const disable = async (id: string) => {
  const existingUser = await findOneById(id);
  const previousFeatures = existingUser.features;

  const updatedUser = await setFeatures(
    id,
    authorization.DISABLED_USER_FEATURES,
  );

  return { user: updatedUser, previousFeatures };
};

const enable = async (id: string, features: string[]) => {
  return setFeatures(id, features);
};

const isDisabled = (targetUser: { features: string[] }) => {
  return (
    JSON.stringify(targetUser.features) ===
    JSON.stringify(authorization.DISABLED_USER_FEATURES)
  );
};

const user = {
  create,
  findOneById,
  findOneByUsername,
  findOneByEmail,
  findOneByLogin,
  findAllPaginated,
  updateByUsername,
  update,
  setFeatures,
  addFeatures,
  disable,
  enable,
  isDisabled,
};

export default user;
