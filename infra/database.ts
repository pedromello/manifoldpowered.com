import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "generated/prisma/client";
import { ServiceError } from "./errors";

let connectionString = `postgresql://${process.env["POSTGRES_USER"]}:${process.env["POSTGRES_PASSWORD"]}@${process.env["POSTGRES_HOST"]}`;

if (process.env["POSTGRES_PORT"]) {
  connectionString += `:${process.env["POSTGRES_PORT"]}`;
}

connectionString += `/${process.env["POSTGRES_DB"]}?schema=public`;

if (process.env.NODE_ENV === "production") {
  connectionString += "&sslmode=require";
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const clearDatabase = async () => {
  await prisma.$executeRaw`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`;
};

const clearDatabaseRows = async () => {
  const tables = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations';`,
  );

  for (const table of tables) {
    if (table.tablename) {
      await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE "public"."${table.tablename}" CASCADE;`,
      );
    }
  }
};

const queryRaw = async <T>(query: Prisma.Sql) => {
  try {
    return await prisma.$queryRaw<T>(query);
  } catch (error) {
    throw new ServiceError({
      message: "Database connection or query failed",
      cause: error,
    });
  }
};

export { prisma, clearDatabase, clearDatabaseRows, queryRaw };
