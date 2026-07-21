import { prisma } from "infra/database";
import password from "models/password";
import { NotFoundError, ValidationError } from "infra/errors";
import { z } from "zod";
import authorization from "models/authorization";
import { Prisma } from "generated/prisma/client";

export const userSchema = z.object({
  username: z.string().min(1).max(30),
  email: z.email(),
  password: z.string().min(1).nullable(),
});

export const userAdminQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  q: z.string().optional(),
});

export type CreateUserDto = z.infer<typeof userSchema> & {
  features?: string[];
};

interface UpdateUserDto {
  username?: string;
  email?: string;
  password?: string;
  features?: string[];
}

const create = async (createUserDto: CreateUserDto) => {
  await validateUniqueEmail(createUserDto.email);
  await validateUniqueUsername(createUserDto.username);
  await hashPasswordInObject(createUserDto);
  injectDefaultFeaturesInObject(createUserDto);

  return prisma.user.create({
    data: {
      username: createUserDto.username.toLowerCase().trim(),
      email: createUserDto.email.toLowerCase().trim(),
      password: createUserDto.password,
      features: createUserDto.features,
    },
  });

  function injectDefaultFeaturesInObject(
    userDto: CreateUserDto | UpdateUserDto,
  ) {
    userDto.features = ["read:activation_token"];
  }
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
  if (userUpdateDto.username) {
    await validateUniqueUsername(userUpdateDto.username);
  }

  if (userUpdateDto.email) {
    await validateUniqueEmail(userUpdateDto.email);
  }

  if (userUpdateDto.password) {
    await hashPasswordInObject(userUpdateDto);
  }

  const user = await findOneByUsername(username);

  return update(user.id, userUpdateDto);
};

const update = async (id: string, userUpdateDto: UpdateUserDto) => {
  const updatedUser = await prisma.user.update({
    where: {
      id,
    },
    data: userUpdateDto,
  });

  return updatedUser;
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
      features: [...user.features, ...features],
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
