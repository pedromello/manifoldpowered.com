import { Prisma } from "generated/prisma/client";
import { prisma } from "infra/database";
import { NextApiRequest, NextApiResponse } from "next";

async function status(req: NextApiRequest, res: NextApiResponse) {
  const updatedAt = new Date().toISOString();

  const dbVersionResult = await prisma.$queryRaw<{
    server_version: string;
  }>`SHOW server_version;`;
  const dbVersion = dbVersionResult[0].server_version;

  const dbMaxConnectionsResult = await prisma.$queryRaw<{
    max_connections: string;
  }>`SHOW max_connections;`;
  const dbMaxConnections = dbMaxConnectionsResult[0].max_connections;

  const databaseName = process.env.POSTGRES_DB;

  const dbOpenConnectionsResult = await prisma.$queryRaw(
    Prisma.sql`SELECT COUNT(*) as count FROM pg_stat_activity WHERE datname = ${databaseName};`,
  );
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

export default status;
