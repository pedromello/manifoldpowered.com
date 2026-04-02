import retry from "async-retry";
import * as database from "infra/database";
import user from "models/user";
import session from "models/session";
import { faker } from "@faker-js/faker";

const waitForAllServices = async () => {
  await waitForWebServer();

  async function waitForWebServer() {
    await retry(
      async () => {
        const response = await fetch("http://localhost:3000/api/v1/status");
        if (response.status !== 200) {
          throw new Error("Web server is not ready");
        }
      },
      { retries: 100, maxTimeout: 1000 },
    );
  }
};

const clearDatabase = async () => {
  await database.clearDatabase();
};

const clearDatabaseRows = async () => {
  await database.clearDatabaseRows();
};

const createUser = async (userDto = {}) => {
  return user.create({
    username:
      userDto.username || faker.internet.username().replace(/[_.-]/g, ""),
    email: userDto.email || faker.internet.email(),
    password: userDto.password || faker.internet.password(),
  });
};

const createSession = async (userId) => {
  return session.create(userId);
};

const orchestrator = {
  waitForAllServices,
  clearDatabase,
  clearDatabaseRows,
  createUser,
  createSession,
};

export default orchestrator;
