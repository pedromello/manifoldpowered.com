import { prisma } from "../../../../infra/database";

async function status(req: any, res: any) {
  await prisma.$connect();
  await prisma.$disconnect();
  res.status(200).json({ status: "Index API is running smoothly." });
}

export default status;
