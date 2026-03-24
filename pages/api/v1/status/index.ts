import { Prisma } from "generated/prisma/client";
import { queryRaw } from "infra/database";
import { NextApiRequest, NextApiResponse } from "next";
import { createRouter } from "next-connect";
import controller from "infra/controller";

const router = createRouter<NextApiRequest, NextApiResponse>();
router.get(getHandler);

export default router.handler(controller.errorHandlers);

async function getHandler(req: NextApiRequest, res: NextApiResponse) {
  const updatedAt = new Date().toISOString();

  const dbVersionResult = await queryRaw<{
    server_version: string;
  }>(Prisma.sql`SHOW server_version;`);
  const dbVersion = dbVersionResult[0].server_version;

  const dbMaxConnectionsResult = await queryRaw<{
    max_connections: string;
  }>(Prisma.sql`SHOW max_connections;`);
  const dbMaxConnections = dbMaxConnectionsResult[0].max_connections;

  const databaseName = process.env.POSTGRES_DB;

  const dbOpenConnectionsResult = await queryRaw<{ count: string }>(Prisma.sql`SELECT COUNT(*) as count FROM pg_stat_activity WHERE datname = ${databaseName};`);
  const dbOpenConnections = Number(dbOpenConnectionsResult[0].count);

  res.status(200).json({
    updated_at: updatedAt,
    dependencies: {
      database: {
        version: dbVersion,
        max_connections: parseInt(dbMaxConnections),
        open_connections: dbOpenConnections,
      },
    },
  });
}
