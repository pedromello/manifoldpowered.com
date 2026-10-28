import { z } from "zod";
import type { Command } from "./registry";
import {
  selectionCreateSchema,
  selectionUpdateSchema,
  selectionSlugSchema,
  selectionGamesSchema,
  selectionRevisionSchema,
} from "../../../contracts/outlet-selections";
import { ApiClient } from "./client";

const slug = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-z0-9][a-z0-9_-]*$/);
const reference = z
  .object({ slug, selection_slug: selectionSlugSchema })
  .strict();
const changed = reference.extend({
  expected_draft_revision: selectionRevisionSchema,
});
function command(
  schema: z.ZodType,
  description: string,
  mutation = false,
  authenticated = true,
): Command {
  return { schema, description, mutation, authenticated };
}
export const selectionCommands: Record<string, Command> = {
  "outlets selections discover": command(
    z.object({ limit: z.number().int().min(1).max(12).default(3) }).strict(),
    "Discover published game selections",
    false,
    false,
  ),
  "outlets selections list": command(
    z
      .object({
        slug,
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(50).default(20),
      })
      .strict(),
    "List this outlet's selection drafts",
  ),
  "outlets selections get": command(
    reference,
    "Read a selection draft and its revision",
  ),
  "outlets selections public": command(
    reference,
    "Read a published selection",
    false,
    false,
  ),
  "outlets selections create": command(
    selectionCreateSchema
      .omit({ slug: true })
      .extend({ slug, selection_slug: selectionSlugSchema })
      .strict(),
    "Create a named outlet selection",
    true,
  ),
  "outlets selections update": command(
    selectionUpdateSchema.safeExtend({
      slug,
      selection_slug: selectionSlugSchema,
    }),
    "Edit selection text, images, or games",
    true,
  ),
  "outlets selections games set": command(
    changed.extend({ game_slugs: selectionGamesSchema }).strict(),
    "Replace or reorder a selection's games",
    true,
  ),
  "outlets selections readiness": command(
    reference,
    "Inspect selection publication blockers",
  ),
  "outlets selections preview": command(
    reference,
    "Get an authenticated selection preview URL",
  ),
  "outlets selections publish": command(
    changed,
    "Publish the inspected selection revision",
    true,
  ),
  "outlets selections unpublish": command(
    changed,
    "Withdraw a published selection",
    true,
  ),
};

export async function selectionAction(
  name: string,
  input: Record<string, unknown>,
  api: ApiClient,
) {
  if (!name.startsWith("outlets selections ")) return undefined;
  const { slug, selection_slug, ...body } = input;
  const outlet = `/stores/${encodeURIComponent(String(slug))}/selections`;
  const path = `${outlet}/${encodeURIComponent(String(selection_slug))}`;
  if (name.endsWith(" discover"))
    return {
      data: (
        await api.request(`/public/selections?limit=${body.limit}`, {
          anonymous: true,
        })
      ).body,
    };
  if (name.endsWith(" list"))
    return {
      data: (
        await api.request(
          `${outlet}?preview=1&page=${body.page}&limit=${body.limit}`,
        )
      ).body,
    };
  if (name.endsWith(" create"))
    return {
      data: (
        await api.request(outlet, {
          method: "POST",
          body: { ...body, slug: selection_slug },
        })
      ).body,
    };
  if (name.endsWith(" update") || name.endsWith(" games set"))
    return { data: (await api.request(path, { method: "PATCH", body })).body };
  if (name.endsWith(" readiness") || name.endsWith(" preview")) {
    const data = (await api.request(`${path}/publication`)).body;
    const selection = data.selection as { public_path?: string } | undefined;
    return {
      data: {
        ...data,
        ...(selection?.public_path
          ? {
              preview_url: new URL(
                `${selection.public_path}?preview=1`,
                api.origin,
              ).href,
              public_url: new URL(selection.public_path, api.origin).href,
            }
          : {}),
      },
    };
  }
  if (name.endsWith(" publish") || name.endsWith(" unpublish")) {
    const data = (
      await api.request(`${path}/publication`, {
        method: "POST",
        body: {
          action: name.endsWith(" unpublish") ? "unpublish" : "publish",
          ...body,
        },
      })
    ).body;
    const selection = data.selection as { public_path?: string } | undefined;
    return {
      data: {
        ...data,
        ...(selection?.public_path
          ? { public_url: new URL(selection.public_path, api.origin).href }
          : {}),
      },
    };
  }
  return {
    data: (
      await api.request(
        `${path}${name.endsWith(" public") ? "" : "?preview=1"}`,
        { anonymous: name.endsWith(" public") },
      )
    ).body,
  };
}
