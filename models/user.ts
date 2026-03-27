import { prisma } from "infra/database";
import { NotFoundError, ValidationError } from "infra/errors";

interface CreateUserDto {
  username: string;
  email: string;
  password: string;
}

const create = async (createUserDto: CreateUserDto) => {
  await validateUniqueEmail(createUserDto.email);
  await validateUniqueUsername(createUserDto.username);

  return prisma.user.create({
    data: {
      username: createUserDto.username.toLowerCase().trim(),
      email: createUserDto.email.toLowerCase().trim(),
      password: createUserDto.password,
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

const user = {
  create,
  findOneByUsername,
};

export default user;
