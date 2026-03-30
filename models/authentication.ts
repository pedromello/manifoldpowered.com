
import user from "./user";
import password from "./password";
import { UnauthorizedError } from "infra/errors";

async function getAuthenticatedUser(providedEmail: string, providedPassword: string) {
  try {
    const userFound = await findUserByEmail(providedEmail);
    await validatePassword(providedPassword, userFound.password);
    return userFound;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw new UnauthorizedError({
        message: "Invalid credentials",
        action: "Check your credentials",
      });
    }

    throw error;
  }

  async function findUserByEmail(email: string) {
    try {
      const userFound = await user.findOneByEmail(email);
      return userFound;
    } catch (error) {
      throw new UnauthorizedError({
        message: "Invalid email",
        action: "Check your email",
      });
    }
  }
};

async function validatePassword(providedPassword: string, storedPassword: string) {
  const isPasswordValid = await password.compare(providedPassword, storedPassword);
  if (!isPasswordValid) {
    throw new UnauthorizedError({
      message: "Invalid password",
      action: "Check your password",
    });
  }
}

const authentication = { getAuthenticatedUser, validatePassword };

export default authentication;
