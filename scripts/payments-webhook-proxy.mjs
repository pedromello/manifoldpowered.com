import http from "node:http";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), true);
if (process.env.NODE_ENV === "production")
  throw new Error("Local proxy cannot run in production.");
const token = process.env.APPMAX_WEBHOOK_TOKEN;
const appmaxPath =
  token && token.length >= 32 ? `/api/v1/webhooks/appmax/${token}` : null;
const stripePath = "/api/v1/webhooks/stripe";
http
  .createServer(async (req, res) => {
    const route = req.url?.split("?")[0];
    if (
      req.method !== "POST" ||
      ![stripePath, appmaxPath].filter(Boolean).includes(route)
    ) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (
      route === stripePath &&
      typeof req.headers["stripe-signature"] !== "string"
    ) {
      res.writeHead(400);
      res.end();
      return;
    }
    const chunks = [];
    let size = 0;
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024) {
          res.writeHead(413);
          res.end();
          return;
        }
        chunks.push(chunk);
      }
      const response = await fetch(`http://127.0.0.1:3000${route}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(route === stripePath
            ? { "stripe-signature": req.headers["stripe-signature"] }
            : {}),
        },
        body: Buffer.concat(chunks),
        signal: AbortSignal.timeout(30000),
      });
      const body = await response.text();
      res.writeHead(response.status, { "Content-Type": "application/json" });
      res.end(body);
      console.log(`Payment notification: HTTP ${response.status}`);
    } catch {
      res.writeHead(502);
      res.end();
    }
  })
  .listen(3001, "127.0.0.1", () =>
    console.log("Payment webhook proxy ready at 127.0.0.1:3001."),
  );
