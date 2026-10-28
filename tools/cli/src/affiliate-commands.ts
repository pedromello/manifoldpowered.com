import { z } from "zod";
import type { Command } from "./registry";
import { ApiClient } from "./client";
import { CliError } from "./errors";
import {
  affiliateWriteSchema,
  affiliateDeleteSchema,
  affiliateLinkInputSchema,
  type AffiliateLink,
  type AffiliateLinkInput,
} from "../../../contracts/outlet-affiliates";

const slug = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-z0-9][a-z0-9_-]*$/);
const reference = z.object({ slug }).strict();
export const affiliateCommands: Record<string, Command> = {
  "outlets affiliates list": {
    schema: reference,
    description: "Consultar links afiliados e revisão do rascunho",
    authenticated: true,
  },
  "outlets affiliates public": {
    schema: reference.extend({ game_slug: slug.optional() }),
    description:
      "Consultar links publicados, gerais ou resolvidos para um jogo",
  },
  "outlets affiliates add": {
    schema: affiliateWriteSchema
      .extend({ slug })
      .superRefine((value, context) => {
        if (value.link.id)
          context.addIssue({
            code: "custom",
            path: ["link", "id"],
            message:
              "Novos links não podem informar ID; use update para editar.",
          });
      }),
    description: "Adicionar link afiliado ao rascunho sem publicar",
    mutation: true,
    authenticated: true,
  },
  "outlets affiliates update": {
    schema: affiliateWriteSchema.extend({
      slug,
      link: affiliateLinkInputSchema.safeExtend({ id: z.uuid() }),
    }),
    description: "Editar link afiliado mantendo seu identificador",
    mutation: true,
    authenticated: true,
  },
  "outlets affiliates remove": {
    schema: affiliateDeleteSchema.extend({ slug }),
    description: "Remover link afiliado do rascunho sem publicar",
    mutation: true,
    authenticated: true,
  },
};

function sameLink(link: AffiliateLink, input: AffiliateLinkInput) {
  return input.id
    ? link.id === input.id
    : link.kind === input.kind &&
        link.merchant === input.merchant &&
        link.platform === input.platform &&
        link.media_type === input.media_type &&
        link.game_slug === input.game_slug &&
        link.country === input.country &&
        link.url === input.url;
}

/** Uses ordinary scoped API requests; an indeterminate write is never retried. */
export async function affiliateAction(
  name: string,
  input: Record<string, unknown>,
  api: ApiClient,
) {
  if (!name.startsWith("outlets affiliates ")) return undefined;
  const { slug: outletSlug, ...body } = input;
  const path = `/stores/${encodeURIComponent(String(outletSlug))}/affiliate-links`;
  if (name.endsWith(" list"))
    return { data: (await api.request(`${path}?draft=1`)).body };
  if (name.endsWith(" public")) {
    const query =
      typeof body.game_slug === "string"
        ? `?${new URLSearchParams({ game_slug: body.game_slug })}`
        : "";
    return {
      data: (await api.request(`${path}${query}`, { anonymous: true })).body,
    };
  }
  const remove = name.endsWith(" remove");
  const linkInput = body.link as AffiliateLinkInput | undefined;
  const linkId = remove ? String(body.id) : linkInput?.id;
  let receipt: Record<string, unknown>;
  try {
    receipt = (
      await api.request(path, {
        method: remove ? "DELETE" : name.endsWith(" update") ? "PATCH" : "POST",
        body,
      })
    ).body;
    if (
      typeof receipt.draft_revision !== "number" ||
      !Number.isSafeInteger(receipt.draft_revision) ||
      receipt.draft_revision < 1
    ) {
      throw new CliError(
        "INVALID_API_RESPONSE",
        "A API não confirmou a revisão alterada; consulte os links antes de repetir.",
        1,
        { mutation_outcome: "unknown" },
      );
    }
  } catch (error) {
    if (error instanceof CliError) {
      error.details = {
        ...(error.details && typeof error.details === "object"
          ? error.details
          : {}),
        slug: outletSlug,
        ...(linkId ? { affiliate_link_id: linkId } : {}),
        next_command: "outlets affiliates list",
      };
    }
    throw error;
  }
  // A follow-up read cannot downgrade an accepted mutation into a failed write.
  try {
    const current = (await api.request(`${path}?draft=1`)).body;
    if (!Array.isArray(current.links)) throw new Error("Invalid draft");
    const found = linkInput
      ? (current.links as AffiliateLink[]).find((link) =>
          sameLink(link, linkInput),
        )
      : undefined;
    return {
      data: {
        ...receipt,
        slug: outletSlug,
        affiliate_link_id: found?.id ?? linkId ?? null,
        resource_status: remove
          ? "removed_from_draft"
          : found
            ? "draft"
            : "not_in_current_draft",
        mutation_outcome: "applied",
        current_draft_revision: current.draft_revision,
        ...(found ? { link: found } : {}),
      },
    };
  } catch {
    return {
      data: {
        ...receipt,
        slug: outletSlug,
        affiliate_link_id: linkId ?? null,
        mutation_outcome: "applied",
        resource_status: remove ? "removed_from_draft" : "draft",
        verification_pending: true,
      },
      next_action: { command: "outlets affiliates list", slug: outletSlug },
    };
  }
}
