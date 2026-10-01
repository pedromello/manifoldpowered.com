import type { NextApiRequest, NextApiResponse } from "next";
import {
  hostHeaderValidation,
  originValidation,
  toNodeHandler,
} from "@modelcontextprotocol/node";
import { MCP_BODY_LIMIT, publicCatalogMcp } from "infra/public_catalog_mcp";
import webserver from "infra/webserver";

const canonicalHostname = new URL(webserver.getOrigin()).hostname;
const allowedHostnames =
  process.env.NODE_ENV === "production"
    ? [canonicalHostname]
    : [canonicalHostname, "localhost", "127.0.0.1", "[::1]"];
const validateHost = hostHeaderValidation(allowedHostnames);
const validateOrigin = originValidation(allowedHostnames);
const handleMcp = toNodeHandler(publicCatalogMcp, {
  maxRequestBodySize: MCP_BODY_LIMIT,
});

export const config = {
  api: { bodyParser: false, responseLimit: false, externalResolver: true },
};

export default async function mcpHandler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  if (!validateHost(req, res) || !validateOrigin(req, res)) return;
  // No cookie/User injection: this endpoint always has the public catalog view.
  await handleMcp(req, res);
}
