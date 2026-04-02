import { prisma } from "infra/database";
import password from "models/password";
import { NotFoundError, ValidationError } from "infra/errors";

interface CreateUserDto {
  username: string;
  email: string;
  password: string;
}

interface UpdateUserDto {
  username?: string;
  email?: string;
  password?: string;
}

const create = async (createUserDto: CreateUserDto) => {
  await validateUniqueEmail(createUserDto.email);
  await validateUniqueUsername(createUserDto.username);
  await hashPasswordInObject(createUserDto);

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

const hashPasswordInObject = async (userDto: CreateUserDto | UpdateUserDto) => {
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

const user = {
  create,
  findOneById,
  findOneByUsername,
  findOneByEmail,
  updateByUsername,
  update,
};

export default user;
