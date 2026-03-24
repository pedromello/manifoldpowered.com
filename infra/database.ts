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

export { prisma, clearDatabase, queryRaw };
