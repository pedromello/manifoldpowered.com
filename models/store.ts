import { prisma } from "infra/database";
import { z } from "zod";
import { NotFoundError, ValidationError } from "infra/errors";
import { Prisma } from "generated/prisma/client";
import userModel from "models/user";

export const storeSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
});

export type StoreCreateDto = z.infer<typeof storeSchema> & {
  owner_id: string;
};

export const MEMBER_PERMISSIONS = ["update:store", "manage:store_members"];

export const memberPermissionsSchema = z.object({
  permissions: z.array(z.enum(MEMBER_PERMISSIONS)).min(1),
});

export const storeAdminQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  q: z.string().optional(),
});

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/--+/g, "-")
    .trim();
}

async function validateUniqueSlug(slug: string) {
  const existingStore = await prisma.store.findUnique({
    where: {
      slug,
    },
    select: {
      name: true,
      slug: true,
    },
  });

  if (existingStore) {
    throw new ValidationError({
      message: `Store with slug ${existingStore.slug} already exists. Its name is ${existingStore.name}.`,
      action: "Try a different name.",
    });
  }
}

async function create(storeData: StoreCreateDto) {
  const slug = generateSlug(storeData.name);
  await validateUniqueSlug(slug);

  return await prisma.store.create({
    data: {
      name: storeData.name,
      description: storeData.description,
      owner_id: storeData.owner_id,
      slug,
    },
  });
}

async function findAllPaginated({
  page = 1,
  limit = 20,
  q,
}: {
  page?: number;
  limit?: number;
  q?: string;
}) {
  const where: Prisma.StoreWhereInput = {};

  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
    ];
  }

  const [stores, total] = await Promise.all([
    prisma.store.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.store.count({ where }),
  ]);

  return {
    stores,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

async function findOneBySlug(slug: string) {
  const store = await prisma.store.findUnique({
    where: {
      slug,
    },
  });

  if (!store) {
    throw new NotFoundError({
      message: `Store with slug "${slug}" was not found.`,
      action: "Check the slug and try again.",
    });
  }

  return store;
}

async function findOneBySlugWithMembers(slug: string) {
  const store = await findOneBySlug(slug);

  const members = await prisma.storeMember.findMany({
    where: {
      store_id: store.id,
    },
  });

  return { ...store, members };
}

async function update(
  id: string,
  updateData: Partial<z.infer<typeof storeSchema>>,
) {
  const existingStore = await prisma.store.findUnique({
    where: {
      id,
    },
  });

  if (!existingStore) {
    throw new NotFoundError({
      message: "Store not found.",
      action: "Check the store ID and try again.",
    });
  }

  const storeUpdateSchema = storeSchema.partial();
  const result = storeUpdateSchema.safeParse(updateData);

  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const validatedData = result.data;

  let newSlug = existingStore.slug;
  if (validatedData.name && validatedData.name !== existingStore.name) {
    newSlug = generateSlug(validatedData.name);
    if (newSlug !== existingStore.slug) {
      await validateUniqueSlug(newSlug);
    }
  }

  return await prisma.store.update({
    where: {
      id,
    },
    data: {
      ...validatedData,
      slug: newSlug,
    },
  });
}

async function addMember(
  storeId: string,
  username: string,
  permissions: string[],
) {
  const targetUser = await userModel.findOneByUsername(username);

  const store = await prisma.store.findUnique({
    where: {
      id: storeId,
    },
  });

  if (!store) {
    throw new NotFoundError({
      message: "Store not found.",
      action: "Check the store ID and try again.",
    });
  }

  if (targetUser.id === store.owner_id) {
    throw new ValidationError({
      message:
        "The store owner already has full access and cannot be added as a member.",
      action: "Choose a different user to add as a member.",
    });
  }

  try {
    return await prisma.storeMember.create({
      data: {
        store_id: storeId,
        user_id: targetUser.id,
        permissions,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ValidationError({
        message: `User "${username}" is already a member of this store.`,
        action: "Update their permissions instead of adding them again.",
      });
    }
    throw error;
  }
}

async function findOneMemberByUsername(storeId: string, username: string) {
  const targetUser = await userModel.findOneByUsername(username);

  const member = await prisma.storeMember.findUnique({
    where: {
      store_id_user_id: {
        store_id: storeId,
        user_id: targetUser.id,
      },
    },
  });

  if (!member) {
    throw new NotFoundError({
      message: `User "${username}" is not a member of this store.`,
      action: "Check the username and try again.",
    });
  }

  return member;
}

async function updateMemberPermissions(
  storeId: string,
  username: string,
  permissions: string[],
) {
  const member = await findOneMemberByUsername(storeId, username);

  return await prisma.storeMember.update({
    where: {
      id: member.id,
    },
    data: {
      permissions,
    },
  });
}

async function removeMember(storeId: string, username: string) {
  const member = await findOneMemberByUsername(storeId, username);

  await prisma.storeMember.delete({
    where: {
      id: member.id,
    },
  });
}

async function listMembersWithUsernames(storeId: string) {
  const members = await prisma.storeMember.findMany({
    where: {
      store_id: storeId,
    },
    orderBy: {
      created_at: "asc",
    },
  });

  const userIds = members.map((member) => member.user_id);
  const users = await prisma.user.findMany({
    where: {
      id: { in: userIds },
    },
    select: {
      id: true,
      username: true,
    },
  });

  const usernameByUserId = users.reduce(
    (acc, user) => {
      acc[user.id] = user.username;
      return acc;
    },
    {} as Record<string, string>,
  );

  return members.map((member) => ({
    ...member,
    username: usernameByUserId[member.user_id] || "unknown",
  }));
}

const store = {
  create,
  findAllPaginated,
  findOneBySlug,
  findOneBySlugWithMembers,
  update,
  addMember,
  updateMemberPermissions,
  removeMember,
  listMembersWithUsernames,
};

export default store;
