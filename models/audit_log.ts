import { Prisma } from "generated/prisma/client";
import { prisma } from "infra/database";

interface RecordAdminActionDto {
  admin_user_id: string;
  action: string;
  target_type: string;
  target_id: string;
  reason?: string;
  metadata?: Prisma.InputJsonValue;
}

async function record(logDto: RecordAdminActionDto) {
  return await prisma.adminActionLog.create({
    data: {
      admin_user_id: logDto.admin_user_id,
      action: logDto.action,
      target_type: logDto.target_type,
      target_id: logDto.target_id,
      reason: logDto.reason,
      metadata: logDto.metadata,
    },
  });
}

async function findAllPaginated({
  page = 1,
  limit = 20,
  admin_user_id,
  action,
  target_type,
  target_id,
}: {
  page?: number;
  limit?: number;
  admin_user_id?: string;
  action?: string;
  target_type?: string;
  target_id?: string;
}) {
  const where: Prisma.AdminActionLogWhereInput = {};

  if (admin_user_id) {
    where.admin_user_id = admin_user_id;
  }

  if (action) {
    where.action = action;
  }

  if (target_type) {
    where.target_type = target_type;
  }

  if (target_id) {
    where.target_id = target_id;
  }

  const [logs, total] = await Promise.all([
    prisma.adminActionLog.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.adminActionLog.count({ where }),
  ]);

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

const auditLog = {
  record,
  findAllPaginated,
};

export default auditLog;
