import { prisma } from "infra/database";
import { ValidationError } from "infra/errors";

interface CreateUserDto {
  username: string;
  email: string;
  password: string;
}

const create = async (createUserDto: CreateUserDto) => {
  const user = await findUserByEmail(createUserDto.email);

  if (user) {
    throw new ValidationError({
      message: `User with email ${createUserDto.email} already exists`,
      action: "Try another email",
    });
  }

  const userByUsername = await findUserByUsername(createUserDto.username);

  if (userByUsername) {
    throw new ValidationError({
      message: `User with username ${createUserDto.username} already exists`,
      action: "Try another username",
    });
  }

  return prisma.user.create({
    data: {
      username: createUserDto.username.toLowerCase().trim(),
      email: createUserDto.email.toLowerCase().trim(),
      password: createUserDto.password,
    },
  });
};

const findUserByEmail = async (email: string) => {
  return prisma.user.findUnique({
    where: {
      email: email.toLowerCase().trim(),
    },
  });
};

const findUserByUsername = async (username: string) => {
  return prisma.user.findUnique({
    where: {
      username: username.toLowerCase(),
    },
  });
};

const user = {
  create,
  findUserByEmail,
  findUserByUsername,
};

export default user;
