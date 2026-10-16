import { z } from "zod";
import { curatorCommands } from "./curator-commands";
import {
  userSchema,
  requestOtpSchema,
  verifyOtpSchema,
  passwordLoginSchema,
  studioSchema,
  storeSchema,
  storeUpdateSchema,
  catalogModeSchema,
  creatorSelectionSchema,
  featuredGameSelectionSchema,
} from "../../../contracts/creator-requests";

const empty = z.object({}).strict();
const slug = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "Slug inválido");
const slugInput = z.object({ slug }).strict();
const revision = z.number().int().positive();
export const importReferenceSchema = z
  .object({
    provider: z.enum(["steam", "nintendo"]),
    reference: z.string().trim().min(1).max(2048),
  })
  .strict();
export type Command = {
  schema: z.ZodType;
  description: string;
  mutation?: boolean;
  authenticated?: boolean;
  secrets?: readonly string[];
};
export const commands: Record<string, Command> = {
  ...curatorCommands,
  "profiles create": {
    schema: z
      .object({
        name: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
        url: z.string().optional(),
      })
      .strict(),
    description: "Criar perfil isolado de ambiente, origem e conta",
    mutation: true,
  },
  "profiles list": { schema: empty, description: "Listar perfis de agentes" },
  "profiles get": {
    schema: z
      .object({ name: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/) })
      .strict(),
    description: "Consultar contexto de um perfil",
  },
  "runs list": {
    schema: z
      .object({ limit: z.number().int().min(1).max(100).default(20) })
      .strict(),
    description: "Listar execuções deste contexto",
  },
  "runs get": {
    schema: z.object({ execution_id: z.uuid() }).strict(),
    description: "Consultar resultado e recursos de uma execução",
  },
  "runs resume": {
    schema: z.object({ execution_id: z.uuid() }).strict(),
    description: "Consultar importações pendentes sem reenviar alterações",
    authenticated: true,
  },
  "env connect": {
    schema: z.object({ url: z.string().optional() }).strict(),
    description: "Configurar e verificar um ambiente",
  },
  "env list": { schema: empty, description: "Listar ambientes" },
  "env status": { schema: empty, description: "Verificar a API do ambiente" },
  "users register": {
    schema: userSchema
      .extend({ password: userSchema.shape.password.default(null) })
      .strict(),
    description: "Cadastrar uma conta real",
    mutation: true,
    secrets: ["password"],
  },
  "users activate": {
    schema: z.object({ activation_url: z.string().min(1).optional() }).strict(),
    description: "Ativar a conta e guardar sua sessão",
    mutation: true,
    secrets: ["activation_url"],
  },
  "auth login request": {
    schema: requestOtpSchema.extend({ email: z.email().optional() }).strict(),
    description: "Solicitar código de login",
    mutation: true,
  },
  "auth login verify": {
    schema: verifyOtpSchema
      .extend({ code: verifyOtpSchema.shape.code.optional() })
      .strict(),
    description: "Verificar código de login",
    mutation: true,
    secrets: ["code"],
  },
  "auth login password": {
    schema: passwordLoginSchema.strict(),
    description: "Entrar com senha",
    mutation: true,
    secrets: ["password"],
  },
  "auth accounts": {
    schema: empty,
    description: "Listar contas salvas neste ambiente",
  },
  "auth use": {
    schema: empty,
    description: "Selecionar uma conta para consultas",
    mutation: true,
    authenticated: true,
  },
  "auth whoami": {
    schema: empty,
    description: "Consultar a identidade autenticada",
    authenticated: true,
  },
  "auth logout": {
    schema: empty,
    description: "Revogar a sessão selecionada",
    mutation: true,
    authenticated: true,
  },
  "studios create": {
    schema: studioSchema.strict(),
    description: "Criar um studio",
    mutation: true,
    authenticated: true,
  },
  "studios list": {
    schema: empty,
    description: "Listar studios da conta",
    authenticated: true,
  },
  "studios get": { schema: slugInput, description: "Consultar um studio" },
  "games list": {
    schema: z
      .object({
        q: z.string().optional(),
        tags: z.string().optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
        order: z
          .enum(["newest", "oldest", "price_asc", "price_desc", "title_asc"])
          .optional(),
      })
      .strict(),
    description: "Pesquisar o catálogo compartilhado",
  },
  "games get": { schema: slugInput, description: "Consultar um jogo" },
  "games import steam": {
    schema: z
      .object({ reference: z.string().trim().min(1).max(2048) })
      .strict(),
    description: "Importar App ID ou URL Steam",
    mutation: true,
    authenticated: true,
  },
  "games import nintendo": {
    schema: z
      .object({ reference: z.string().trim().min(1).max(2048) })
      .strict(),
    description: "Importar URL Nintendo eShop",
    mutation: true,
    authenticated: true,
  },
  "games import batch": {
    schema: z
      .object({ games: z.array(importReferenceSchema).min(1).max(100) })
      .strict(),
    description: "Importar uma lista de jogos sequencialmente",
    mutation: true,
    authenticated: true,
  },
  "games import status": {
    schema: importReferenceSchema
      .extend({ operation_id: z.uuid().optional() })
      .strict(),
    description: "Consultar ou acompanhar uma importação",
    authenticated: true,
  },
  "outlets create": {
    schema: storeSchema.extend({
      layout_preset: storeSchema.shape.layout_preset.default("channel"),
    }),
    description: "Criar um outlet em rascunho",
    mutation: true,
    authenticated: true,
  },
  "outlets list": {
    schema: empty,
    description: "Listar outlets da conta",
    authenticated: true,
  },
  "outlets get": {
    schema: slugInput,
    description: "Consultar o rascunho de um outlet",
    authenticated: true,
  },
  "outlets update": {
    schema: storeUpdateSchema.extend({
      slug,
      expected_draft_revision: revision,
    }),
    description: "Alterar identidade e apresentação",
    mutation: true,
    authenticated: true,
  },
  "outlets options": {
    schema: empty,
    description: "Listar presets e opções de apresentação",
  },
  "outlets catalog mode": {
    schema: catalogModeSchema.extend({ slug }).strict(),
    description: "Selecionar ALL ou SELECTED",
    mutation: true,
    authenticated: true,
  },
  "outlets catalog set": {
    schema: z.discriminatedUnion("strategy", [
      creatorSelectionSchema.options[0].extend({ slug }),
      creatorSelectionSchema.options[1].extend({ slug }),
    ]),
    description: "Selecionar catálogo por jogos ou tags",
    mutation: true,
    authenticated: true,
  },
  "outlets featured set": {
    schema: featuredGameSelectionSchema.options[0].extend({ slug }).strict(),
    description: "Definir destaques e recomendações",
    mutation: true,
    authenticated: true,
  },
  "outlets readiness": {
    schema: slugInput,
    description: "Consultar revisão e bloqueios de publicação",
    authenticated: true,
  },
  "outlets preview": {
    schema: slugInput,
    description: "Obter prévia privada e estado do rascunho",
    authenticated: true,
  },
  "outlets publish": {
    schema: z.object({ slug, expected_draft_revision: revision }).strict(),
    description: "Publicar a revisão verificada",
    mutation: true,
    authenticated: true,
  },
};
export const globalOptions = {
  env: { type: "string" },
  account: { type: "string" },
  profile: { type: "string" },
  input: { type: "string" },
  json: { type: "boolean" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean" },
  "no-banner": { type: "boolean" },
  wait: { type: "boolean" },
  timeout: { type: "string" },
  mailcatcher: { type: "boolean" },
  locale: { type: "string" },
} as const;
export const payloadOptions = Object.fromEntries(
  [
    "url",
    "username",
    "email",
    "login",
    "name",
    "description",
    "logo-url",
    "slug",
    "reference",
    "provider",
    "operation-id",
    "q",
    "tags",
    "page",
    "limit",
    "order",
    "catalog-mode",
    "layout-preset",
    "tagline",
    "cover-url",
    "social-links",
    "brand-tokens",
    "expected-draft-revision",
    "revision",
    "strategy",
    "game-slugs",
    "recommendations",
    "games",
    "app-id",
    "palette",
    "typography",
    "shape",
    "game-slug",
    "headline",
    "body",
    "message",
    "mode",
    "action",
    "visibility",
    "tag",
    "status",
    "request-fingerprint",
    "target-scale",
    "rating",
    "mapping",
    "execution-id",
  ].map((key) => [key, { type: "string" as const }]),
);
export const parseOptions = {
  ...globalOptions,
  ...payloadOptions,
  "is-publisher": { type: "boolean" as const },
  recommended: { type: "boolean" as const },
  "check-images": { type: "boolean" as const },
};
