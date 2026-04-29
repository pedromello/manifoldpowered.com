import retry from "async-retry";
import * as database from "infra/database";
import storage from "infra/storage";
import user from "models/user";
import session from "models/session";
import { faker } from "@faker-js/faker";
import activation from "models/activation";
import webserver from "infra/webserver";
import game from "models/game";

const EMAIL_HTTP_URL = `http://${process.env.EMAIL_HTTP_HOST}:${process.env.EMAIL_HTTP_PORT}`;

const waitForAllServices = async () => {
  await waitForWebServer();
  await waitForEmailServer();

  async function waitForWebServer() {
    await retry(
      async () => {
        const response = await fetch(`${webserver.getOrigin()}/api/v1/status`);
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

const getUserById = async (userId) => {
  return user.findOneById(userId);
};

const activateUser = async (userId) => {
  return activation.activateUserByUserId(userId);
};

const addFeaturesToUser = async (userId, features) => {
  return user.addFeatures(userId, features);
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

// Games
const createGame = async (userId, gameData = {}) => {
  return game.create({
    user_id: userId,
    title: gameData.title || faker.commerce.productName(),
    description: gameData.description || faker.lorem.sentence(),
    detailed_description:
      gameData.detailed_description || faker.lorem.paragraph(),
    launch_date: gameData.launch_date || faker.date.past(),
    price: gameData.price || faker.number.float(),
    developer_name: gameData.developer_name || faker.company.name(),
    tags: gameData.tags || [faker.lorem.word()],
    meta_tags: gameData.meta_tags || {},
    media: gameData.media || { screenshots: [], videos: [] },
    social_links: gameData.social_links || {},
    requirements: gameData.requirements || undefined,
  });
};

const getGameBySlug = async (slug) => {
  return game.findOneBySlug(slug);
};

const clearStorage = async () => {
  await storage.clearAllBuckets();
  await storage.createBucket();
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
  addFeaturesToUser,
  getUserById,
  createGame,
  getGameBySlug,
  clearStorage,
};

export default orchestrator;
