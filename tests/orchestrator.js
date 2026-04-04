import retry from "async-retry";
import * as database from "infra/database";
import user from "models/user";
import session from "models/session";
import { faker } from "@faker-js/faker";
import activation from "models/activation";

const EMAIL_HTTP_URL = `http://${process.env.EMAIL_HTTP_HOST}:${process.env.EMAIL_HTTP_PORT}`;

const waitForAllServices = async () => {
  await waitForWebServer();
  await waitForEmailServer();

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

  async function waitForEmailServer() {
    await retry(
      async () => {
        const response = await fetch(`${EMAIL_HTTP_URL}`);
        if (response.status !== 200) {
          throw new Error("Email server is not ready");
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

const activateUser = async (userId) => {
  return activation.activateUserByUserId(userId);
};

const createSession = async (userId) => {
  return session.create(userId);
};

// Emails
const deleteAllEmails = async () => {
  // There is no method to delete all emails through the transporter, so we use the HTTP API
  await fetch(`${EMAIL_HTTP_URL}/messages`, {
    method: "DELETE",
  });
};

const getLastEmail = async () => {
  const emailListResponse = await fetch(`${EMAIL_HTTP_URL}/messages`);
  const emailList = await emailListResponse.json();

  const lastEmail = emailList.pop();

  if (!lastEmail) {
    return null;
  }

  const emailContentResponse = await fetch(
    `${EMAIL_HTTP_URL}/messages/${lastEmail.id}.plain`,
  );
  const emailContent = await emailContentResponse.text();

  lastEmail.text = emailContent;
  return lastEmail;
};

const extractUUID = (text) => {
  const regex = /[0-9a-fA-F-]{36}/;
  const match = text.match(regex);
  return match ? match[0] : null;
};

const orchestrator = {
  waitForAllServices,
  clearDatabase,
  clearDatabaseRows,
  createUser,
  activateUser,
  createSession,
  deleteAllEmails,
  getLastEmail,
  extractUUID,
};

export default orchestrator;
