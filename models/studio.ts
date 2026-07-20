import { prisma } from "infra/database";
import { z } from "zod";
import { NotFoundError, ValidationError } from "infra/errors";
import { Prisma } from "generated/prisma/client";
import userModel from "models/user";

export const studioSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  is_publisher: z.boolean().default(false),
});

export type StudioCreateDto = z.infer<typeof studioSchema> & {
  owner_id: string;
};

export const MEMBER_PERMISSIONS = [
  "update:studio",
  "manage:studio_members",
  "create:game",
  "update:game",
  "create:game_file",
  "delete:game_file",
];

export const memberPermissionsSchema = z.object({
  permissions: z.array(z.enum(MEMBER_PERMISSIONS)).min(1),
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
  const existingStudio = await prisma.studio.findUnique({
    where: {
      slug,
    },
    select: {
      name: true,
      slug: true,
    },
  });

  if (existingStudio) {
    throw new ValidationError({
      message: `Studio with slug ${existingStudio.slug} already exists. Its name is ${existingStudio.name}.`,
      action: "Try a different name.",
    });
  }
}

async function create(studioData: StudioCreateDto) {
  const slug = generateSlug(studioData.name);
  await validateUniqueSlug(slug);

  return await prisma.studio.create({
    data: {
      name: studioData.name,
      description: studioData.description,
      is_publisher: studioData.is_publisher,
      owner_id: studioData.owner_id,
      slug,
    },
  });
}

async function findOneById(id: string) {
  const studio = await prisma.studio.findUnique({
    where: {
      id,
    },
  });

  if (!studio) {
    throw new NotFoundError({
      message: `Studio with id "${id}" was not found.`,
      action: "Check the studio id and try again.",
    });
  }

  return studio;
}

async function findOneByIdWithMembers(id: string) {
  const studio = await findOneById(id);

  const members = await prisma.studioMember.findMany({
    where: {
      studio_id: studio.id,
    },
  });

  return { ...studio, members };
}

async function findOneBySlug(slug: string) {
  const studio = await prisma.studio.findUnique({
    where: {
      slug,
    },
  });

  if (!studio) {
    throw new NotFoundError({
      message: `Studio with slug "${slug}" was not found.`,
      action: "Check the slug and try again.",
    });
  }

  return studio;
}

async function findOneBySlugWithMembers(slug: string) {
  const studio = await findOneBySlug(slug);

  const members = await prisma.studioMember.findMany({
    where: {
      studio_id: studio.id,
    },
  });

  return { ...studio, members };
}

async function update(
  id: string,
  updateData: Partial<z.infer<typeof studioSchema>>,
) {
  const existingStudio = await prisma.studio.findUnique({
    where: {
      id,
    },
  });

  if (!existingStudio) {
    throw new NotFoundError({
      message: "Studio not found.",
      action: "Check the studio ID and try again.",
    });
  }

  const studioUpdateSchema = studioSchema.partial();
  const result = studioUpdateSchema.safeParse(updateData);

  if (!result.success) {
    throw new ValidationError({
      message: "One or more fields are invalid",
      action: "Check the fields and try again",
      context: result.error.issues,
    });
  }

  const validatedData = result.data;

  let newSlug = existingStudio.slug;
  if (validatedData.name && validatedData.name !== existingStudio.name) {
    newSlug = generateSlug(validatedData.name);
    if (newSlug !== existingStudio.slug) {
      await validateUniqueSlug(newSlug);
    }
  }

  return await prisma.studio.update({
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
  studioId: string,
  username: string,
  permissions: string[],
) {
  const targetUser = await userModel.findOneByUsername(username);

  const studio = await prisma.studio.findUnique({
    where: {
      id: studioId,
    },
  });

  if (!studio) {
    throw new NotFoundError({
      message: "Studio not found.",
      action: "Check the studio ID and try again.",
    });
  }

  if (targetUser.id === studio.owner_id) {
    throw new ValidationError({
      message:
        "The studio owner already has full access and cannot be added as a member.",
      action: "Choose a different user to add as a member.",
    });
  }

  try {
    return await prisma.studioMember.create({
      data: {
        studio_id: studioId,
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
        message: `User "${username}" is already a member of this studio.`,
        action: "Update their permissions instead of adding them again.",
      });
    }
    throw error;
  }
}

async function findOneMemberByUsername(studioId: string, username: string) {
  const targetUser = await userModel.findOneByUsername(username);

  const member = await prisma.studioMember.findUnique({
    where: {
      studio_id_user_id: {
        studio_id: studioId,
        user_id: targetUser.id,
      },
    },
  });

  if (!member) {
    throw new NotFoundError({
      message: `User "${username}" is not a member of this studio.`,
      action: "Check the username and try again.",
    });
  }

  return member;
}

async function updateMemberPermissions(
  studioId: string,
  username: string,
  permissions: string[],
) {
  const member = await findOneMemberByUsername(studioId, username);

  return await prisma.studioMember.update({
    where: {
      id: member.id,
    },
    data: {
      permissions,
    },
  });
}

async function removeMember(studioId: string, username: string) {
  const member = await findOneMemberByUsername(studioId, username);

  await prisma.studioMember.delete({
    where: {
      id: member.id,
    },
  });
}

async function listMembersWithUsernames(studioId: string) {
  const members = await prisma.studioMember.findMany({
    where: {
      studio_id: studioId,
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

const studio = {
  create,
  findOneById,
  findOneByIdWithMembers,
  findOneBySlug,
  findOneBySlugWithMembers,
  update,
  addMember,
  updateMemberPermissions,
  removeMember,
  listMembersWithUsernames,
};

export default studio;
