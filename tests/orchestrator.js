import retry from "async-retry";
import * as database from "infra/database";

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

const orchestrator = {
  waitForAllServices,
  clearDatabase,
  clearDatabaseRows,
};

export default orchestrator;
