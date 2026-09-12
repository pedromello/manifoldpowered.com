/** Local-only creator demo. Never resets tables or writes to remote databases. */
import { prisma } from "infra/database";
import nintendo from "infra/nintendo";
import nintendoImport from "models/nintendo_import";
import { nintendoProductUrl } from "lib/nintendo";
import authorization from "models/authorization";
import storeModel, {
  STORE_OWNER_FEATURES,
  MEMBER_PERMISSIONS,
  storeSchema,
} from "models/store";
import {
  assertLocalShowcaseSeedTarget,
  readConfirmedDatabase,
} from "scripts/seed-outlet-preset-showcase-policy";

const id = (n: number) =>
  `9d110000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ownerId = id(1);
const games = [
  {
    title: "Donkey Kong Bananza",
    slug: "donkey-kong-bananza",
    video: "B2Mhsf6OU5A",
    date: "2025-07-17",
    platform: "Nintendo Switch 2",
    category: "Action",
    developer: "Nintendo",
    description:
      "Explore cenários destrutíveis em uma aventura de plataforma com Donkey Kong e Pauline.",
    review:
      "TUDO de BOM e RUIM em Donkey Kong Bananza! Vale comprar um Switch 2 pra jogar?",
    reason:
      "Uma aventura para conhecer o Switch 2. Assista à análise completa do Coelho.",
  },
  {
    title: "Mario Kart World",
    slug: "mario-kart-world",
    video: "LsoX00HFbLs",
    date: "2025-06-05",
    platform: "Nintendo Switch 2",
    category: "Racing",
    developer: "Nintendo",
    description: "Corridas, exploração e encontros pelo mundo de Mario Kart.",
    review: "O que verdadeiramente achei de Mario Kart World, vale a pena?",
    reason: "Antes da próxima corrida, veja a análise completa do Coelho.",
  },
  {
    title: "Pikmin 4",
    slug: "pikmin-4",
    video: "H0bc_rpHLT8",
    date: "2023-07-21",
    platform: "Nintendo Switch",
    category: "Strategy",
    developer: "Nintendo",
    description:
      "Lidere pequenos exploradores, resolva desafios e descubra um mundo visto de perto.",
    review:
      "Pikmin 4: Evolução Ousada Que Eleva a Franquia a Níveis de Mario e Zelda",
    reason:
      "Uma descoberta diferente no Switch, com review do Coelho no Japão.",
  },
  {
    title: "Super Mario Maker 2",
    slug: "super-mario-maker-2",
    video: "9kBxwT3M340",
    date: "2019-06-28",
    platform: "Nintendo Switch",
    category: "Platformer",
    developer: "Nintendo",
    description:
      "Crie suas próprias fases de Mario e descubra os desafios da comunidade.",
    review: "Super Mario Maker 2 Review / Análise - Comprar ou não?",
    reason: "Criatividade e plataforma: conheça a análise do canal.",
  },
  {
    title: "Celeste",
    slug: "celeste",
    video: "3qrczdM-pnM",
    date: "2018-01-25",
    platform: "Nintendo Switch",
    category: "Platformer",
    developer: "Maddy Makes Games",
    description:
      "Uma escalada de precisão, descobertas e superação até o topo da montanha Celeste.",
    review: "Celeste Review - Análise e Gameplay nas ruas do JAPÃO",
    reason: "Um indie na seleção, com análise e gameplay do Coelho no Japão.",
  },
] as const;

const outlets = [
  {
    id: id(10),
    slug: "nintendo-barato-demo",
    name: "Nintendo Barato",
    description:
      "Jogos para descobrir, reviews para decidir. Uma seleção de cinco jogos com vídeos do Coelho no Japão. Demonstração local de curadoria.",
    tagline: "Seu próximo jogo começa com uma boa indicação.",
    logo_url: "https://www.nintendobarato.com.br/faviconV2.png",
    layout_preset: "channel" as const,
    palette: "crimson" as const,
    website: "https://www.nintendobarato.com.br/",
    youtube: "https://www.youtube.com/@coelhonojapao",
    cover_url: null,
    featured: [0, 1, 2],
  },
  {
    id: id(11),
    slug: "digplay-demo",
    name: "DIGPLAY",
    description:
      "O universo Nintendo em um só lugar: jogos, descobertas e comunidade. Seleção ilustrativa criada para demonstrar o outlet; não representa recomendações do Digplay.",
    tagline: "Dê play na sua próxima descoberta.",
    logo_url:
      "https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=375,fit=crop/A3QJNzW6E1cR5zV1/logo_branco_transparente-AoPG0yb8yNc2D89g.png",
    layout_preset: "community" as const,
    palette: "burgundy" as const,
    website: "https://www.canaldigplay.com/",
    youtube: "https://www.youtube.com/canaldigplay",
    cover_url:
      "https://images.unsplash.com/photo-1615680022647-99c397cbcaea?auto=format&fit=crop&w=1440",
    featured: [2, 4, 3],
  },
];

async function main() {
  assertLocalShowcaseSeedTarget({
    nodeEnv: process.env.NODE_ENV,
    postgresHost: process.env.POSTGRES_HOST,
    postgresDatabase: process.env.POSTGRES_DB,
    confirmedDatabase: readConfirmedDatabase(process.argv),
  });
  // Refuse to adopt a creator/game/owner that this fixture did not create.
  const owner = await prisma.user.findFirst({
    where: {
      OR: [
        { id: ownerId },
        { username: "nintendo_demo" },
        { email: "nintendo-demo@manifold.local" },
      ],
    },
  });
  if (
    owner &&
    (owner.id !== ownerId ||
      owner.username !== "nintendo_demo" ||
      owner.email !== "nintendo-demo@manifold.local")
  )
    throw new Error("Demo owner collision");
  for (const outlet of outlets) {
    const row = await prisma.store.findFirst({
      where: { OR: [{ id: outlet.id }, { slug: outlet.slug }] },
    });
    if (
      row &&
      (row.id !== outlet.id ||
        row.slug !== outlet.slug ||
        row.owner_id !== ownerId)
    )
      throw new Error(`Outlet collision: ${outlet.slug}`);
    storeSchema.parse({
      name: outlet.name,
      description: outlet.description,
      logo_url: outlet.logo_url,
      tagline: outlet.tagline,
      cover_url: outlet.cover_url,
      layout_preset: outlet.layout_preset,
      social_links: { website: outlet.website, youtube: outlet.youtube },
      brand_tokens: {
        palette: outlet.palette,
        typography: "rounded",
        shape: "soft",
      },
    });
  }
  for (const [i, game] of games.entries()) {
    const row = await prisma.game.findFirst({
      where: {
        OR: [{ id: id(100 + i) }, { slug: `${game.slug}-creator-demo` }],
      },
    });
    if (
      row &&
      (row.id !== id(100 + i) ||
        row.slug !== `${game.slug}-creator-demo` ||
        row.studio_id !== null)
    )
      throw new Error(`Game collision: ${game.slug}`);
  }
  await prisma.user.upsert({
    where: { id: ownerId },
    update: {},
    create: {
      id: ownerId,
      username: "nintendo_demo",
      email: "nintendo-demo@manifold.local",
      password: null,
      features: [
        ...new Set([
          ...authorization.ACTIVATED_USER_FEATURES,
          ...STORE_OWNER_FEATURES,
          ...MEMBER_PERMISSIONS,
        ]),
      ],
    },
  });
  for (const [i, game] of games.entries()) {
    const productSlug =
      game.slug +
      (game.platform === "Nintendo Switch 2" ? "-switch-2" : "-switch");
    const product = await nintendo.fetchProduct(productSlug, "BR");
    if (!product.prices)
      throw new Error(
        "Nintendo did not return a Brazilian price for " + game.title,
      );
    const collision = await prisma.game.findUnique({
      where: { nintendo_nsuid: product.nsuid },
    });
    if (collision && collision.id !== id(100 + i))
      throw new Error("Nintendo identity collision: " + product.nsuid);
    // Attach the verified official identity to our existing fixture, preserving
    // its ID, URL and published outlet reviews. The real importer fills all fields.
    await prisma.game.upsert({
      where: { id: id(100 + i) },
      update: { nintendo_nsuid: product.nsuid },
      create: {
        id: id(100 + i),
        slug: game.slug + "-creator-demo",
        title: product.name,
        description: product.headline || product.name,
        detailed_description: product.name,
        developer_name: game.developer,
        status: "ONLY_DISPLAY",
        price: 0,
        nintendo_nsuid: product.nsuid,
      },
    });
    const result = await nintendoImport.importGame({
      userId: ownerId,
      eshopUrl: nintendoProductUrl(productSlug, "BR"),
      gateway: {
        fetchProduct: (slug, country) =>
          country === "BR" && slug === productSlug
            ? Promise.resolve(product)
            : nintendo.fetchProduct(slug, country),
      },
    });
    if (result.game?.id !== id(100 + i))
      throw new Error("Import did not resolve the expected demo game");
    console.log(
      "Imported from Nintendo:",
      result.game.title,
      product.prices.currency,
      product.prices.finalPrice,
    );
    // This product's BR/US eShop galleries currently contain no video.
    // Supplement the demo with Nintendo of America's verified announcement trailer.
    // This is editorial enrichment, not a video discovered by the eShop importer.
    if (game.slug === "super-mario-maker-2") {
      const media = result.game.media as { videos?: string[] };
      if (!media.videos?.length) {
        await prisma.game.update({
          where: { id: result.game.id },
          data: {
            media: {
              ...media,
              videos: ["https://www.youtube.com/watch?v=AjJWzJC8Kfk"],
            },
          },
        });
      }
    }
  }
  for (const outlet of outlets) {
    const existing = await prisma.store.findUnique({
      where: { id: outlet.id },
    });
    // Preserve an already published demo on reruns; edits belong in the owner editor.
    if (existing?.published_revision_id) {
      console.log(`Existing demo preserved: /pt-BR/store/${outlet.slug}`);
      continue;
    }
    await prisma.$transaction(async (tx) => {
      const data = {
        name: outlet.name,
        slug: outlet.slug,
        owner_id: ownerId,
        description: outlet.description,
        logo_url: outlet.logo_url,
        tagline: outlet.tagline,
        cover_url: outlet.cover_url,
        layout_preset: outlet.layout_preset,
        social_links: { website: outlet.website, youtube: outlet.youtube },
        brand_tokens: {
          palette: outlet.palette,
          typography: "rounded",
          shape: "soft",
        },
        catalog_mode: "SELECTED" as const,
      };
      await tx.store.upsert({
        where: { id: outlet.id },
        update: data,
        create: { id: outlet.id, ...data },
      });
      for (const [i, game] of games.entries()) {
        const pair = { store_id: outlet.id, game_id: id(100 + i) };
        await tx.storeGameOverride.upsert({
          where: { store_id_game_id: pair },
          create: { ...pair, visibility: "SHOW" },
          update: {},
        });
        if (outlet.palette === "crimson") {
          const review = {
            headline: game.review,
            body: `Review em vídeo de ${game.title}, por Coelho no Japão. Assista ao conteúdo original para conhecer a opinião do criador.\n\nhttps://www.youtube.com/watch?v=${game.video}\n\nSeleção de demonstração montada pela Manifold, sem notas ou opiniões atribuídas ao criador.`,
          };
          await tx.storeGameEditorial.upsert({
            where: { store_id_game_id: pair },
            create: { ...pair, ...review },
            update: review,
          });
        }
      }
      for (const [position, index] of outlet.featured.entries()) {
        const pair = { store_id: outlet.id, game_id: id(100 + index) };
        const data = {
          position: position + 1,
          recommendation_reason:
            outlet.palette === "crimson"
              ? games[index].reason
              : `Seleção ilustrativa: ${games[index].description}`,
        };
        await tx.storeFeaturedGame.upsert({
          where: { store_id_game_id: pair },
          create: { ...pair, ...data },
          update: data,
        });
      }
      await tx.store.update({
        where: { id: outlet.id },
        data: { draft_revision: { increment: 1 } },
      });
    });
    const draft = await prisma.store.findUniqueOrThrow({
      where: { id: outlet.id },
    });
    await storeModel.changePublication(
      outlet.id,
      ownerId,
      "publish",
      draft.draft_revision,
    );
    console.log(
      `Created local demo: http://127.0.0.1:3001/pt-BR/store/${outlet.slug}`,
    );
  }
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
