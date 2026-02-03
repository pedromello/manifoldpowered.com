import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "generated/prisma/client";

let connectionString = `postgresql://${process.env["POSTGRES_USER"]}:${process.env["POSTGRES_PASSWORD"]}@${process.env["POSTGRES_HOST"]}`;

if (process.env["POSTGRES_PORT"]) {
    connectionString += `:${process.env["POSTGRES_PORT"]}`;
}

connectionString += `/${process.env["POSTGRES_DB"]}?schema=public`;

if (process.env.NODE_ENV === "production") {
    connectionString += "sslmode=require";
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

export { prisma };
