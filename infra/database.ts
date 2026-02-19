import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "generated/prisma/client";

let connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error("DATABASE_URL is not defined");
}

if (process.env.NODE_ENV === "production") {
    connectionString += "&sslmode=require";
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const cleanDatabase = async () => {
    await prisma.$executeRaw`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`;
};

export { prisma, cleanDatabase };
