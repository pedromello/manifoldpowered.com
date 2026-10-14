import { z } from "zod";
import type { Command } from "./registry";
import {
  reviewInputSchema,
  storeGameEditorialInputSchema,
  tagFilterSchema,
  tagFilterPreviewSchema,
  bulkCurationPreviewSchema,
  bulkCurationSchema,
} from "../../../contracts/curator-requests";
const slug = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-z0-9][a-z0-9_-]*$/);
const revision = z.number().int().positive();
const reference = z.object({ slug }).strict();
const gameReference = reference.extend({ game_slug: slug });
const gameChange = gameReference.extend({ expected_draft_revision: revision });
const pages = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});
const empty = z.object({}).strict();
function command(
  schema: z.ZodType,
  description: string,
  mutation = false,
  authenticated = true,
): Command {
  return { schema, description, mutation, authenticated };
}
export const curatorCommands: Record<string, Command> = {
  "outlets discover": command(
    pages.extend({ q: z.string().optional() }).strict(),
    "Explorar outlets públicas",
    false,
    false,
  ),
  "outlets public": command(
    reference,
    "Consultar versão pública de uma outlet",
    false,
    false,
  ),
  "outlets catalog public": command(
    pages
      .extend({
        slug,
        q: z.string().optional(),
        tags: z.string().optional(),
        order: z
          .enum(["newest", "oldest", "price_asc", "price_desc", "title_asc"])
          .optional(),
      })
      .strict(),
    "Consultar catálogo e editoriais da revisão publicada",
    false,
    false,
  ),
  "outlets featured public": command(
    reference,
    "Consultar destaques da revisão publicada",
    false,
    false,
  ),
  "outlets editorial public": command(
    gameReference,
    "Consultar editorial de jogo na revisão publicada",
    false,
    false,
  ),
  "outlets unpublish": command(
    reference.extend({ expected_draft_revision: revision }),
    "Retirar a publicação da outlet",
    true,
  ),
  "outlets editorial get": command(
    gameReference,
    "Consultar texto editorial do rascunho",
  ),
  "outlets editorial set": command(
    storeGameEditorialInputSchema.extend({ slug, game_slug: slug }),
    "Criar ou editar análise editorial da outlet",
    true,
  ),
  "outlets editorial remove": command(
    gameChange,
    "Remover análise editorial do rascunho",
    true,
  ),
  "outlets catalog list": command(
    pages
      .extend({
        slug,
        limit: z.number().int().min(1).max(48).default(12),
        q: z.string().max(120).optional(),
        tag: z.string().max(100).optional(),
        status: z
          .enum([
            "ALL",
            "IN_OUTLET",
            "OUTSIDE_OUTLET",
            "EDITORIAL",
            "NEW_RELEASES",
            "BEST_SELLERS",
          ])
          .default("ALL"),
        order: z
          .enum(["TITLE_ASC", "NEWEST", "BEST_SELLING"])
          .default("TITLE_ASC"),
      })
      .strict(),
    "Inspecionar jogos e regras do catálogo",
  ),
  "outlets catalog add": command(
    gameChange,
    "Incluir jogo explicitamente no catálogo",
    true,
  ),
  "outlets catalog remove": command(
    gameChange,
    "Ocultar jogo do catálogo",
    true,
  ),
  "outlets catalog reset": command(
    gameChange,
    "Remover exceção e voltar às regras de tags",
    true,
  ),
  "outlets catalog bulk preview": command(
    bulkCurationPreviewSchema.extend({ slug }).strict(),
    "Prever impacto de SHOW, HIDE ou PIN_SHOW",
  ),
  "outlets catalog bulk apply": command(
    bulkCurationSchema.extend({ slug }).strict(),
    "Aplicar lote idempotente previamente verificado",
    true,
  ),
  "outlets tags list": command(reference, "Consultar filtros por tags"),
  "outlets tags add": command(
    tagFilterSchema
      .extend({ slug, expected_draft_revision: revision })
      .strict(),
    "Adicionar filtro por tag",
    true,
  ),
  "outlets tags update": command(
    tagFilterSchema
      .extend({ slug, expected_draft_revision: revision })
      .strict(),
    "Alterar filtro existente por tag",
    true,
  ),
  "outlets tags remove": command(
    reference.extend({
      tag: z.string().min(1).max(100),
      expected_draft_revision: revision,
    }),
    "Remover filtro por tag",
    true,
  ),
  "outlets tags preview": command(
    tagFilterPreviewSchema.safeExtend({ slug }).strict(),
    "Prever impacto de uma regra por tag",
  ),
  "outlets verify": command(
    reference.extend({ check_images: z.boolean().default(false) }),
    "Verificar publicação, catálogo, textos e imagens",
  ),
  "reviews list": command(
    pages.extend({ slug }).strict(),
    "Consultar reviews e elegibilidade da conta",
  ),
  "reviews create": command(
    reviewInputSchema.strict(),
    "Publicar review da conta elegível",
    true,
  ),
  "reviews update": command(
    reviewInputSchema.strict(),
    "Editar review da própria conta",
    true,
  ),
  "reviews remove": command(reference, "Remover review da própria conta", true),
  "library list": command(pages.strict(), "Consultar jogos da biblioteca"),
  "library has": command(
    reference,
    "Verificar se o jogo pertence à biblioteca",
  ),
  "wishlist status": command(reference, "Consultar interesse no jogo"),
  "wishlist add": command(reference, "Adicionar jogo à wishlist", true),
  "wishlist remove": command(reference, "Remover jogo da wishlist", true),
  "outlets followed": command(empty, "Listar outlets acompanhadas"),
  "outlets follow": command(reference, "Acompanhar uma outlet publicada", true),
  "outlets unfollow": command(
    reference,
    "Deixar de acompanhar uma outlet",
    true,
  ),
};
