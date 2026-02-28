const retry = require("async-retry");

async function waitForAllServices() {
    await waitForWebServer();

    async function waitForWebServer() {
        await retry(async () => {
            const response = await fetch("http://localhost:3000/api/v1/status");
            if (response.status !== 200) {
                console.log("Web server is not ready");
                throw new Error("Web server is not ready");
            }
        }, { retries: 10, maxTimeout: 1000 });
    }
}

export default {
    waitForAllServices,
};