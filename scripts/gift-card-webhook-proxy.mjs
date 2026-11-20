import http from "node:http";

// Expose only Stripe's signed webhook through the local development tunnel.
const webhookPath = "/api/v1/webhooks/stripe";
http
  .createServer((request, response) => {
    if (request.method !== "POST" || request.url !== webhookPath) {
      response.writeHead(404).end();
      return;
    }
    if (!request.headers["stripe-signature"]) {
      response.writeHead(400).end();
      return;
    }
    let length = 0;
    const upstream = http.request(
      {
        hostname: "127.0.0.1",
        port: 3000,
        path: webhookPath,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "stripe-signature": request.headers["stripe-signature"],
        },
        timeout: 30000,
      },
      (result) => {
        response.writeHead(result.statusCode ?? 502, {
          "content-type": "application/json",
          "cache-control": "no-store",
        });
        result.pipe(response);
        console.log(`Stripe webhook: HTTP ${result.statusCode}`);
      },
    );
    upstream.on("timeout", () => upstream.destroy());
    upstream.on("error", () => {
      if (!response.headersSent) response.writeHead(502);
      response.end();
    });
    request.on("data", (chunk) => {
      length += chunk.length;
      if (length > 1024 * 1024) {
        request.unpipe(upstream);
        upstream.destroy();
        if (!response.headersSent) response.writeHead(413);
        response.end();
        request.resume();
      }
    });
    request.on("aborted", () => upstream.destroy());
    request.pipe(upstream);
  })
  .listen(3001, "127.0.0.1", () => {
    console.log("Stripe webhook proxy ready at 127.0.0.1:3001");
  });
