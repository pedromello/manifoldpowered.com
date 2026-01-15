import { prisma } from "infra/database";

async function status(req: any, res: any) {
  const updatedAt = new Date().toISOString();

  const dbVersionResult = await prisma.$queryRaw<{ server_version: string }>`SHOW server_version;`;
  const dbVersion = dbVersionResult[0].server_version;

  const dbMaxConnectionsResult = await prisma.$queryRaw<{ max_connections: string }>`SHOW max_connections;`;
  const dbMaxConnections = dbMaxConnectionsResult[0].max_connections;

  const dbOpenConnectionsResult = await prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) as count FROM pg_stat_activity WHERE datname = 'local_db';`;
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
