/**
 * Idempotent, local-only visual-QA fixtures for the three self-service Outlet
 * presentation presets.
 *
 * This script never clears tables. Every row it owns has a deterministic UUID
 * and/or slug, and a collision preflight refuses to adopt unrelated data. Store
 * drafts are mutable, but publication still goes through
 * models/store.changePublication
 * so every changed public presentation is captured by a new immutable
 * StoreRevision. An identical rerun sees the matching published snapshot and
 * does not append another revision.
 *
 * Usage (the script is intentionally not wired into npm run dev):
 *   npx tsx --env-file=.env.development scripts/seed-outlet-preset-showcase.ts --confirm-database=local_db
 *   npx tsx --env-file=.env.development scripts/seed-outlet-preset-showcase.ts --confirm-database=local_db --origin=http://localhost:3001
 */

import { isDeepStrictEqual } from "node:util";

import type {
  StoreBrandTokens,
  StoreLayoutPreset,
  StoreSocialLinks,
} from "contracts/store-presentation";
import { STORE_PRESENTATION_VERSION } from "contracts/store-presentation";
import {
  Prisma,
  type ReviewScore,
  type Store,
  type StoreRevision,
} from "generated/prisma/client";
import { prisma } from "infra/database";
import authorization from "models/authorization";
import { gameSchema } from "models/game";
import storeModel, {
  MEMBER_PERMISSIONS,
  STORE_OWNER_FEATURES,
  storeSchema,
} from "models/store";
import {
  assertExactFixtureState,
  assertLocalShowcaseSeedTarget,
  readConfirmedDatabase,
} from "scripts/seed-outlet-preset-showcase-policy";

const FIXTURE_PREFIX = "7a310000-0000-4000-8000";
const FIXTURE_TIMESTAMP = new Date("2026-08-01T12:00:00.000Z");
const DEFAULT_ORIGIN = "http://localhost:3000";

function fixtureId(sequence: number): string {
  return `${FIXTURE_PREFIX}-${String(sequence).padStart(12, "0")}`;
}

function unsplashImage(photoId: string, width = 1600, height = 900): string {
  return `https://images.unsplash.com/${photoId}?fit=crop&fm=jpg&w=${width}&h=${height}&q=82`;
}

const OWNER_FIXTURE = {
  id: fixtureId(1),
  username: "outlet_showcase",
  email: "outlet-showcase@manifold.local",
} as const;

const STUDIO_FIXTURES = [
  {
    id: fixtureId(101),
    name: "Nightjar Assembly",
    slug: "nightjar-assembly",
    description: "Small-team action games with bright worlds and sharp edges.",
  },
  {
    id: fixtureId(102),
    name: "Soft Current",
    slug: "soft-current",
    description: "Quiet adventures about place, memory, and companionship.",
  },
  {
    id: fixtureId(103),
    name: "Lantern Room",
    slug: "lantern-room",
    description: "Narrative puzzles built for patient, curious players.",
  },
  {
    id: fixtureId(104),
    name: "Common Thread Games",
    slug: "common-thread-games",
    description: "Approachable multiplayer games made for shared screens.",
  },
  {
    id: fixtureId(105),
    name: "Orbit & Oak",
    slug: "orbit-and-oak",
    description: "Systemic strategy games with hopeful science-fiction worlds.",
  },
] as const;

type LocalizedCopy = {
  readonly title: string;
  readonly description: string;
  readonly detailedDescription: string;
};

type GameFixture = {
  readonly id: string;
  readonly localizationId: string;
  readonly studioId: string;
  readonly title: string;
  readonly slug: string;
  readonly description: string;
  readonly detailedDescription: string;
  readonly launchDate: string;
  readonly createdAt: string;
  readonly price: string;
  readonly basePrice: string;
  readonly discountLabel: string | null;
  readonly tags: readonly string[];
  readonly bannerUrl: string;
  readonly category: string;
  readonly positiveReviews: number;
  readonly negativeReviews: number;
  readonly reviewScore: ReviewScore;
  readonly ptBr: LocalizedCopy;
};

type GameFixtureInput = Omit<
  GameFixture,
  "id" | "localizationId" | "studioId" | "createdAt" | "bannerUrl"
> & {
  readonly studio: number;
  readonly photoId: string;
};

function defineGame(sequence: number, input: GameFixtureInput): GameFixture {
  return {
    ...input,
    id: fixtureId(300 + sequence),
    localizationId: fixtureId(600 + sequence),
    studioId: STUDIO_FIXTURES[input.studio - 1].id,
    createdAt: new Date(Date.UTC(2026, 7, sequence, 12, 0, 0)).toISOString(),
    bannerUrl: unsplashImage(input.photoId),
  };
}

const GAME_FIXTURES = [
  defineGame(1, {
    studio: 1,
    title: "Neon Ronin",
    slug: "neon-ronin",
    description:
      "Dash through a rain-lit megacity in a score-chasing action roguelike.",
    detailedDescription:
      "Every run through Kiba City remixes rival crews, rooftop routes, and sword techniques. Chain perfect parries, reroute the night train, and build a style that survives the final tower.",
    launchDate: "2026-05-14T12:00:00.000Z",
    price: "19.9900",
    basePrice: "24.9900",
    discountLabel: "-20%",
    tags: ["Action", "Roguelike", "Cyberpunk", "Indie"],
    photoId: "photo-1511512578047-dfb367046420",
    category: "Action",
    positiveReviews: 1842,
    negativeReviews: 76,
    reviewScore: "OVERWHELMINGLY_POSITIVE",
    ptBr: {
      title: "Neon Ronin",
      description:
        "Atravesse uma megacidade chuvosa neste roguelike de ação e pontuação.",
      detailedDescription:
        "Cada jornada por Kiba City combina novas gangues, rotas pelos telhados e técnicas de espada. Encadeie defesas perfeitas e crie um estilo capaz de chegar à torre final.",
    },
  }),
  defineGame(2, {
    studio: 5,
    title: "Circuit Breaker",
    slug: "circuit-breaker",
    description:
      "Build a tiny orbital factory where every cable, robot, and watt matters.",
    detailedDescription:
      "Turn a silent relay station into a living machine. Lay modular production lines, balance a fragile power grid, and automate rescue missions before the next solar storm arrives.",
    launchDate: "2026-02-20T12:00:00.000Z",
    price: "29.9900",
    basePrice: "29.9900",
    discountLabel: null,
    tags: ["Strategy", "Automation", "Sci-Fi", "Indie"],
    photoId: "photo-1526374965328-7f61d4dc18c5",
    category: "Strategy",
    positiveReviews: 934,
    negativeReviews: 58,
    reviewScore: "VERY_POSITIVE",
    ptBr: {
      title: "Circuit Breaker",
      description:
        "Construa uma pequena fábrica orbital onde cada cabo, robô e watt importa.",
      detailedDescription:
        "Transforme uma estação silenciosa em uma máquina viva. Monte linhas modulares, equilibre a rede elétrica e automatize resgates antes da próxima tempestade solar.",
    },
  }),
  defineGame(3, {
    studio: 5,
    title: "Starfall Courier",
    slug: "starfall-courier",
    description:
      "Deliver impossible parcels across a hand-painted chain of little planets.",
    detailedDescription:
      "Pilot a patched-together courier ship between tiny worlds with their own weather, customs, and shortcuts. Every delivery changes who trusts you and which routes open next.",
    launchDate: "2025-11-06T12:00:00.000Z",
    price: "14.9900",
    basePrice: "19.9900",
    discountLabel: "-25%",
    tags: ["Action", "Exploration", "Sci-Fi", "Indie"],
    photoId: "photo-1446776811953-b23d57bd21aa",
    category: "Action",
    positiveReviews: 721,
    negativeReviews: 44,
    reviewScore: "VERY_POSITIVE",
    ptBr: {
      title: "Starfall Courier",
      description:
        "Entregue encomendas impossíveis por uma constelação de pequenos planetas.",
      detailedDescription:
        "Pilote uma nave de entregas remendada entre mundos com climas, costumes e atalhos próprios. Cada entrega muda quem confia em você e quais rotas surgem depois.",
    },
  }),
  defineGame(4, {
    studio: 1,
    title: "Emberline",
    slug: "emberline",
    description:
      "Keep a runaway mountain train alive in a two-player action adventure.",
    detailedDescription:
      "One player drives while the other repairs, scouts, and clears the rails. Swap roles at every station and make hard calls about fuel, passengers, and the storm behind you.",
    launchDate: "2026-07-09T12:00:00.000Z",
    price: "20.9900",
    basePrice: "29.9900",
    discountLabel: "-30%",
    tags: ["Action", "Co-op", "Adventure", "Indie"],
    photoId: "photo-1473445361085-b9a07f55608b",
    category: "Action",
    positiveReviews: 438,
    negativeReviews: 32,
    reviewScore: "VERY_POSITIVE",
    ptBr: {
      title: "Emberline",
      description:
        "Mantenha um trem desgovernado vivo em uma aventura de ação para duas pessoas.",
      detailedDescription:
        "Uma pessoa conduz enquanto a outra conserta, explora e libera os trilhos. Troquem de função nas estações e decidam juntos como usar combustível e salvar passageiros.",
    },
  }),
  defineGame(5, {
    studio: 2,
    title: "Moss & Moonlight",
    slug: "moss-and-moonlight",
    description:
      "Restore an abandoned night garden one gentle conversation at a time.",
    detailedDescription:
      "Tend luminous plants, brew tea for passing spirits, and uncover the stories hidden in a walled garden. There are no timers—only seasons, friendships, and small acts of care.",
    launchDate: "2026-04-02T12:00:00.000Z",
    price: "17.9900",
    basePrice: "17.9900",
    discountLabel: null,
    tags: ["Cozy", "Exploration", "Narrative", "Indie"],
    photoId: "photo-1441974231531-c6227db76b6e",
    category: "Adventure",
    positiveReviews: 1260,
    negativeReviews: 41,
    reviewScore: "OVERWHELMINGLY_POSITIVE",
    ptBr: {
      title: "Moss & Moonlight",
      description:
        "Restaure um jardim noturno abandonado, uma conversa tranquila por vez.",
      detailedDescription:
        "Cuide de plantas luminosas, prepare chá para espíritos viajantes e descubra histórias escondidas. Não há cronômetros: apenas estações, amizades e pequenos gestos de carinho.",
    },
  }),
  defineGame(6, {
    studio: 3,
    title: "Paper Kingdoms",
    slug: "paper-kingdoms",
    description:
      "Rewrite a folding storybook world by choosing which legends survive.",
    detailedDescription:
      "Lead a travelling archive through kingdoms made of paper and ink. Your editorial choices change borders, heroes, and even the rules of later tactical encounters.",
    launchDate: "2025-09-18T12:00:00.000Z",
    price: "23.9900",
    basePrice: "29.9900",
    discountLabel: "-20%",
    tags: ["Narrative", "Strategy", "Fantasy", "Indie"],
    photoId: "photo-1455390582262-044cdead277a",
    category: "Strategy",
    positiveReviews: 612,
    negativeReviews: 67,
    reviewScore: "VERY_POSITIVE",
    ptBr: {
      title: "Paper Kingdoms",
      description:
        "Reescreva um mundo de livro dobrável escolhendo quais lendas sobrevivem.",
      detailedDescription:
        "Conduza um arquivo itinerante por reinos de papel e tinta. Suas escolhas editoriais alteram fronteiras, heróis e até as regras dos encontros táticos seguintes.",
    },
  }),
  defineGame(7, {
    studio: 3,
    title: "The Last Signal",
    slug: "the-last-signal",
    description:
      "Decode one final transmission from a lighthouse beyond the mapped sea.",
    detailedDescription:
      "Tune an analog radio, compare weather logs, and piece together a mystery told across three decades. Each solved frequency reveals a room the lighthouse tried to forget.",
    launchDate: "2026-06-12T12:00:00.000Z",
    price: "12.9900",
    basePrice: "12.9900",
    discountLabel: null,
    tags: ["Narrative", "Puzzle", "Mystery", "Indie"],
    photoId: "photo-1500530855697-b586d89ba3ee",
    category: "Puzzle",
    positiveReviews: 377,
    negativeReviews: 21,
    reviewScore: "VERY_POSITIVE",
    ptBr: {
      title: "The Last Signal",
      description:
        "Decifre a transmissão final de um farol além do mar conhecido.",
      detailedDescription:
        "Sintonize um rádio analógico, compare registros do clima e monte um mistério contado ao longo de três décadas. Cada frequência revela uma sala esquecida do farol.",
    },
  }),
  defineGame(8, {
    studio: 2,
    title: "Harbor of Echoes",
    slug: "harbor-of-echoes",
    description:
      "Sail a flooded city and collect the voices that still linger there.",
    detailedDescription:
      "Chart canals between half-submerged rooftops, record local songs, and decide which memories belong in the new city museum. The tide redraws your route every morning.",
    launchDate: "2025-12-04T12:00:00.000Z",
    price: "18.9900",
    basePrice: "18.9900",
    discountLabel: null,
    tags: ["Narrative", "Exploration", "Adventure", "Indie"],
    photoId: "photo-1500375592092-40eb2168fd21",
    category: "Adventure",
    positiveReviews: 843,
    negativeReviews: 53,
    reviewScore: "VERY_POSITIVE",
    ptBr: {
      title: "Harbor of Echoes",
      description:
        "Navegue por uma cidade alagada e reúna as vozes que ainda vivem nela.",
      detailedDescription:
        "Mapeie canais entre telhados, grave canções locais e escolha quais memórias entrarão no novo museu. A maré redesenha sua rota a cada manhã.",
    },
  }),
  defineGame(9, {
    studio: 5,
    title: "Clockwork Orchard",
    slug: "clockwork-orchard",
    description:
      "Grow mechanical fruit by solving compact, interlocking garden puzzles.",
    detailedDescription:
      "Wind tiny irrigation engines, cross-pollinate brass blossoms, and discover how every patch of the orchard powers the next. Build at your own pace and share layouts.",
    launchDate: "2026-01-22T12:00:00.000Z",
    price: "9.9900",
    basePrice: "14.9900",
    discountLabel: "-33%",
    tags: ["Puzzle", "Cozy", "Strategy", "Indie"],
    photoId: "photo-1416879595882-3373a0480b5b",
    category: "Strategy",
    positiveReviews: 534,
    negativeReviews: 18,
    reviewScore: "OVERWHELMINGLY_POSITIVE",
    ptBr: {
      title: "Clockwork Orchard",
      description:
        "Cultive frutas mecânicas resolvendo pequenos quebra-cabeças de jardim.",
      detailedDescription:
        "Dê corda em motores de irrigação, cruze flores de latão e descubra como cada canteiro alimenta o próximo. Construa no seu ritmo e compartilhe seus jardins.",
    },
  }),
  defineGame(10, {
    studio: 2,
    title: "Tiny Foundry",
    slug: "tiny-foundry",
    description: "Turn a pocket-sized workshop into a cheerful automated town.",
    detailedDescription:
      "Place friendly machines, fulfill neighbour requests, and watch your workshop spill into a miniature town. Optimise for beauty, efficiency, or a little of both.",
    launchDate: "2026-03-27T12:00:00.000Z",
    price: "15.9900",
    basePrice: "19.9900",
    discountLabel: "-20%",
    tags: ["Cozy", "Automation", "Simulation", "Indie"],
    photoId: "photo-1531058020387-3be344556be6",
    category: "Simulation",
    positiveReviews: 699,
    negativeReviews: 39,
    reviewScore: "VERY_POSITIVE",
    ptBr: {
      title: "Tiny Foundry",
      description:
        "Transforme uma oficina de bolso em uma alegre cidade automatizada.",
      detailedDescription:
        "Posicione máquinas simpáticas, atenda pedidos da vizinhança e veja a oficina crescer. Otimize para beleza, eficiência ou um pouco dos dois.",
    },
  }),
  defineGame(11, {
    studio: 4,
    title: "Kitchen Coven",
    slug: "kitchen-coven",
    description:
      "Cook enchanted comfort food together before the cauldron boils over.",
    detailedDescription:
      "Coordinate a magical kitchen for two to four cooks. Chop moonroot, negotiate with impatient familiars, and combine spells into increasingly improbable dinner service.",
    launchDate: "2026-07-31T12:00:00.000Z",
    price: "21.9900",
    basePrice: "21.9900",
    discountLabel: null,
    tags: ["Co-op", "Cozy", "Multiplayer", "Indie"],
    photoId: "photo-1556910103-1c02745aae4d",
    category: "Simulation",
    positiveReviews: 288,
    negativeReviews: 15,
    reviewScore: "VERY_POSITIVE",
    ptBr: {
      title: "Kitchen Coven",
      description:
        "Preparem comida encantada juntos antes que o caldeirão transborde.",
      detailedDescription:
        "Coordenem uma cozinha mágica para duas a quatro pessoas. Cortem raízes lunares, acalmem familiares impacientes e combinem feitiços durante o jantar.",
    },
  }),
  defineGame(12, {
    studio: 4,
    title: "Relay Runners",
    slug: "relay-runners",
    description: "Pass the spark through a kinetic four-player rooftop race.",
    detailedDescription:
      "Only the runner carrying the spark can open the next gate. Draft behind teammates, improvise shortcuts, and hand off at exactly the right moment in local or online play.",
    launchDate: "2026-05-29T12:00:00.000Z",
    price: "0.0000",
    basePrice: "0.0000",
    discountLabel: null,
    tags: ["Co-op", "Multiplayer", "Action", "Racing", "Indie"],
    photoId: "photo-1552674605-db6ffd4facb5",
    category: "Racing",
    positiveReviews: 1407,
    negativeReviews: 122,
    reviewScore: "VERY_POSITIVE",
    ptBr: {
      title: "Relay Runners",
      description:
        "Passe a centelha adiante em uma corrida pelos telhados para quatro pessoas.",
      detailedDescription:
        "Apenas quem carrega a centelha abre o próximo portão. Aproveite o vácuo, improvise atalhos e faça a troca no momento certo, localmente ou online.",
    },
  }),
  defineGame(13, {
    studio: 5,
    title: "Astral Cartographers",
    slug: "astral-cartographers",
    description:
      "Map a shared night sky whose constellations rearrange as you explore.",
    detailedDescription:
      "Plan expeditions with up to three friends, triangulate impossible stars, and bring discoveries home to a growing observatory. Every map becomes part of the next voyage.",
    launchDate: "2025-10-10T12:00:00.000Z",
    price: "27.9900",
    basePrice: "34.9900",
    discountLabel: "-20%",
    tags: ["Co-op", "Exploration", "Strategy", "Indie"],
    photoId: "photo-1444703686981-a3abbc4d4fe3",
    category: "Strategy",
    positiveReviews: 967,
    negativeReviews: 48,
    reviewScore: "VERY_POSITIVE",
    ptBr: {
      title: "Astral Cartographers",
      description:
        "Mapeie em grupo um céu noturno cujas constelações mudam durante a jornada.",
      detailedDescription:
        "Planeje expedições com até três amizades, localize estrelas impossíveis e leve descobertas para um observatório em crescimento. Cada mapa ajuda a próxima viagem.",
    },
  }),
  defineGame(14, {
    studio: 4,
    title: "Hex & Hearth",
    slug: "hex-and-hearth",
    description:
      "Defend a travelling inn with friends, cards, and questionable magic.",
    detailedDescription:
      "Build a shared deck while your inn rolls from village to village. Serve guests by day, then combine character roles to hold back strange weather after dark.",
    launchDate: "2026-02-05T12:00:00.000Z",
    price: "16.9900",
    basePrice: "16.9900",
    discountLabel: null,
    tags: ["Co-op", "Strategy", "Multiplayer", "Fantasy", "Indie"],
    photoId: "photo-1516321318423-f06f85e504b3",
    category: "Strategy",
    positiveReviews: 472,
    negativeReviews: 49,
    reviewScore: "VERY_POSITIVE",
    ptBr: {
      title: "Hex & Hearth",
      description:
        "Defenda uma estalagem viajante com amizades, cartas e magia duvidosa.",
      detailedDescription:
        "Monte um baralho coletivo enquanto a estalagem visita novas vilas. Sirva hóspedes de dia e combine funções para enfrentar um clima estranho à noite.",
    },
  }),
  defineGame(15, {
    studio: 4,
    title: "Rainy Day Arcade",
    slug: "rainy-day-arcade",
    description:
      "Fill a sleepy seaside arcade with friendly bite-sized competitions.",
    detailedDescription:
      "Repair old cabinets, invite the neighbourhood, and unlock dozens of quick local multiplayer games. Every high score adds another story to the community scrapbook.",
    launchDate: "2026-06-26T12:00:00.000Z",
    price: "11.9900",
    basePrice: "14.9900",
    discountLabel: "-20%",
    tags: ["Cozy", "Multiplayer", "Casual", "Indie"],
    photoId: "photo-1550745165-9bc0b252726f",
    category: "Casual",
    positiveReviews: 358,
    negativeReviews: 12,
    reviewScore: "OVERWHELMINGLY_POSITIVE",
    ptBr: {
      title: "Rainy Day Arcade",
      description:
        "Encha um fliperama à beira-mar com pequenas competições amigáveis.",
      detailedDescription:
        "Conserte máquinas antigas, convide a vizinhança e desbloqueie dezenas de jogos locais rápidos. Cada recorde acrescenta uma história ao álbum da comunidade.",
    },
  }),
] as const satisfies readonly GameFixture[];

type OutletFilterFixture = {
  readonly id: string;
  readonly tag: string;
  readonly mode: "WHITELIST" | "BLACKLIST";
};

type FeaturedFixture = {
  readonly id: string;
  readonly gameSlug: string;
  readonly position: number;
  readonly recommendationReason: string;
};

type OutletFixture = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly logo_url: string;
  readonly theme_key: null;
  readonly layout_preset: StoreLayoutPreset;
  readonly tagline: string;
  readonly cover_url: string;
  readonly social_links: StoreSocialLinks;
  readonly brand_tokens: StoreBrandTokens;
  readonly filters: readonly OutletFilterFixture[];
  readonly featured: readonly FeaturedFixture[];
};

type OutletPresentationFixture = Omit<
  OutletFixture,
  "id" | "slug" | "filters" | "featured"
>;

function presentation(
  layoutPreset: StoreLayoutPreset,
  brandTokens: StoreBrandTokens,
  values: {
    name: string;
    description: string;
    tagline: string;
    coverUrl: string;
    logoUrl: string;
    socialLinks: StoreSocialLinks;
  },
): OutletPresentationFixture {
  return {
    name: values.name,
    description: values.description,
    logo_url: values.logoUrl,
    theme_key: null,
    layout_preset: layoutPreset,
    tagline: values.tagline,
    cover_url: values.coverUrl,
    social_links: values.socialLinks,
    brand_tokens: brandTokens,
  };
}

const OUTLET_FIXTURES = [
  {
    id: fixtureId(201),
    slug: "signal-boost-live",
    ...presentation(
      "channel",
      { palette: "ember", typography: "modern", shape: "pill" },
      {
        name: "Signal Boost Live",
        description:
          "A weekly broadcast for inventive action games, smart systems, and the small teams making both.",
        tagline: "Indie discoveries, live every Thursday.",
        coverUrl: unsplashImage("photo-1542751371-adc38448a05e", 1800, 720),
        logoUrl: unsplashImage("photo-1598550476439-6847785fcea6", 512, 512),
        socialLinks: {
          website: "https://example.com/signal-boost-live",
          youtube: "https://www.youtube.com/",
          twitch: "https://www.twitch.tv/",
        },
      },
    ),
    filters: [
      { id: fixtureId(401), tag: "action", mode: "WHITELIST" },
      { id: fixtureId(402), tag: "roguelike", mode: "WHITELIST" },
      { id: fixtureId(403), tag: "strategy", mode: "WHITELIST" },
    ],
    featured: [
      {
        id: fixtureId(501),
        gameSlug: "neon-ronin",
        position: 1,
        recommendationReason:
          "Tonight's headline run: immaculate parries, impossible rooftops, and one more try energy.",
      },
      {
        id: fixtureId(502),
        gameSlug: "circuit-breaker",
        position: 2,
        recommendationReason:
          "A compact factory game that turns every watt into a satisfying decision.",
      },
      {
        id: fixtureId(503),
        gameSlug: "emberline",
        position: 3,
        recommendationReason:
          "The rare co-op adventure where swapping jobs is half the fun.",
      },
    ],
  },
  {
    id: fixtureId(202),
    slug: "the-lantern-review",
    ...presentation(
      "editorial",
      { palette: "ocean", typography: "editorial", shape: "crisp" },
      {
        name: "The Lantern Review",
        description:
          "Independent criticism and considered recommendations for games that trust the player's attention.",
        tagline:
          "Illuminating remarkable worlds, one thoughtful game at a time.",
        coverUrl: unsplashImage("photo-1481627834876-b7833e8f5570", 1800, 720),
        logoUrl: unsplashImage("photo-1491841550275-ad7854e35ca6", 512, 512),
        socialLinks: {
          website: "https://example.com/the-lantern-review",
          instagram: "https://www.instagram.com/",
          x: "https://x.com/",
        },
      },
    ),
    filters: [
      { id: fixtureId(404), tag: "narrative", mode: "WHITELIST" },
      { id: fixtureId(405), tag: "puzzle", mode: "WHITELIST" },
      { id: fixtureId(406), tag: "exploration", mode: "WHITELIST" },
    ],
    featured: [
      {
        id: fixtureId(504),
        gameSlug: "the-last-signal",
        position: 1,
        recommendationReason:
          "A beautifully restrained mystery that makes listening feel like exploration.",
      },
      {
        id: fixtureId(505),
        gameSlug: "harbor-of-echoes",
        position: 2,
        recommendationReason:
          "Its flooded streets hold a humane story about what a city chooses to remember.",
      },
      {
        id: fixtureId(506),
        gameSlug: "paper-kingdoms",
        position: 3,
        recommendationReason:
          "Strategy and authorship fold together in unusually elegant ways.",
      },
    ],
  },
  {
    id: fixtureId(203),
    slug: "campfire-co-op",
    ...presentation(
      "community",
      { palette: "manifold", typography: "rounded", shape: "soft" },
      {
        name: "Campfire Co-op",
        description:
          "A welcoming club for couch co-op nights, cosy discoveries, and games that are better shared.",
        tagline: "Pull up a chair. Player two is always welcome.",
        coverUrl: unsplashImage("photo-1529156069898-49953e39b3ac", 1800, 720),
        logoUrl: unsplashImage("photo-1527529482837-4698179dc6ce", 512, 512),
        socialLinks: {
          website: "https://example.com/campfire-co-op",
          instagram: "https://www.instagram.com/",
          tiktok: "https://www.tiktok.com/",
        },
      },
    ),
    filters: [
      { id: fixtureId(407), tag: "co-op", mode: "WHITELIST" },
      { id: fixtureId(408), tag: "cozy", mode: "WHITELIST" },
      { id: fixtureId(409), tag: "multiplayer", mode: "WHITELIST" },
    ],
    featured: [
      {
        id: fixtureId(507),
        gameSlug: "kitchen-coven",
        position: 1,
        recommendationReason:
          "Our Friday-night favourite: chaotic enough for stories, kind enough for newcomers.",
      },
      {
        id: fixtureId(508),
        gameSlug: "relay-runners",
        position: 2,
        recommendationReason:
          "Free, fast, and built around the perfect last-second handoff.",
      },
      {
        id: fixtureId(509),
        gameSlug: "rainy-day-arcade",
        position: 3,
        recommendationReason:
          "A whole shelf of small competitions without a single sore-loser mood.",
      },
    ],
  },
] as const satisfies readonly OutletFixture[];

type PublicationResult = "created" | "published" | "unchanged";

async function main(): Promise<void> {
  assertLocalShowcaseSeedTarget({
    nodeEnv: process.env.NODE_ENV,
    postgresHost: process.env.POSTGRES_HOST,
    postgresDatabase: process.env.POSTGRES_DB,
    confirmedDatabase: readConfirmedDatabase(process.argv.slice(2)),
  });
  validateFixtureContracts();
  await preflightCollisions();

  await ensureOwner();
  await ensureStudios();
  await ensureGames();

  const createdOutlets = new Set<string>();
  for (const outlet of OUTLET_FIXTURES) {
    if (await ensureOutletDraft(outlet)) createdOutlets.add(outlet.slug);
  }
  await ensureCuration();

  const publicationResults = new Map<string, PublicationResult>();
  for (const outlet of OUTLET_FIXTURES) {
    publicationResults.set(
      outlet.slug,
      await ensurePublishedOutlet(outlet, createdOutlets.has(outlet.slug)),
    );
  }

  printSummary(publicationResults);
}

function validateFixtureContracts(): void {
  assertUnique(
    "studio id",
    STUDIO_FIXTURES.map((studio) => studio.id),
  );
  assertUnique(
    "studio slug",
    STUDIO_FIXTURES.map((studio) => studio.slug),
  );
  assertUnique(
    "game id",
    GAME_FIXTURES.map((game) => game.id),
  );
  assertUnique(
    "game slug",
    GAME_FIXTURES.map((game) => game.slug),
  );
  assertUnique(
    "game localization id",
    GAME_FIXTURES.map((game) => game.localizationId),
  );
  assertUnique(
    "Outlet id",
    OUTLET_FIXTURES.map((outlet) => outlet.id),
  );
  assertUnique(
    "Outlet slug",
    OUTLET_FIXTURES.map((outlet) => outlet.slug),
  );
  assertUnique(
    "curation row id",
    OUTLET_FIXTURES.flatMap((outlet) => [
      ...outlet.filters.map((filter) => filter.id),
      ...outlet.featured.map((featured) => featured.id),
    ]),
  );

  const gameBySlug = new Map(GAME_FIXTURES.map((game) => [game.slug, game]));
  for (const game of GAME_FIXTURES) {
    assertHttps(`banner for ${game.slug}`, game.bannerUrl);
    gameSchema.parse({
      title: game.title,
      description: game.description,
      detailed_description: game.detailedDescription,
      launch_date: game.launchDate,
      price: game.price,
      base_price: game.basePrice,
      studio_id: game.studioId,
      tags: [...game.tags],
      meta_tags: {
        category: game.category,
        rating: "Everyone 10+",
        languages: ["English", "Português (Brasil)"],
        keywords: [...game.tags],
        platforms: ["Windows", "macOS", "Linux"],
      },
      media: {
        banner: game.bannerUrl,
        screenshots: [game.bannerUrl],
        videos: [],
      },
      social_links: {
        website: `https://example.com/games/${game.slug}`,
      },
    });
  }

  for (const outlet of OUTLET_FIXTURES) {
    storeSchema.parse({
      name: outlet.name,
      description: outlet.description,
      logo_url: outlet.logo_url,
      layout_preset: outlet.layout_preset,
      tagline: outlet.tagline,
      cover_url: outlet.cover_url,
      social_links: outlet.social_links,
      brand_tokens: outlet.brand_tokens,
    });

    if (outlet.theme_key !== null) {
      throw new Error(`${outlet.slug} must remain a self-service preset.`);
    }

    const whitelist = new Set(
      outlet.filters
        .filter((filter) => filter.mode === "WHITELIST")
        .map((filter) => filter.tag.toLowerCase()),
    );
    const visibleGames = GAME_FIXTURES.filter((game) =>
      game.tags.some((tag) => whitelist.has(tag.toLowerCase())),
    );
    if (visibleGames.length < 6) {
      throw new Error(
        `${outlet.slug} needs at least six visible games for responsive QA.`,
      );
    }

    for (const featured of outlet.featured) {
      const game = gameBySlug.get(featured.gameSlug);
      if (!game) {
        throw new Error(
          `${outlet.slug} features missing game ${featured.gameSlug}.`,
        );
      }
      if (!game.tags.some((tag) => whitelist.has(tag.toLowerCase()))) {
        throw new Error(
          `${featured.gameSlug} is outside ${outlet.slug}'s whitelist.`,
        );
      }
    }
  }
}

function assertUnique(label: string, values: readonly string[]): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`Duplicate ${label} in visual-QA fixture definitions.`);
  }
}

function assertHttps(label: string, value: string): void {
  if (new URL(value).protocol !== "https:") {
    throw new Error(`${label} must use HTTPS.`);
  }
}

async function preflightCollisions(): Promise<void> {
  const [users, studios, games, outlets] = await Promise.all([
    prisma.user.findMany({
      where: {
        OR: [
          { id: OWNER_FIXTURE.id },
          { username: OWNER_FIXTURE.username },
          { email: OWNER_FIXTURE.email },
        ],
      },
    }),
    prisma.studio.findMany({
      where: {
        OR: [
          { id: { in: STUDIO_FIXTURES.map((studio) => studio.id) } },
          { slug: { in: STUDIO_FIXTURES.map((studio) => studio.slug) } },
        ],
      },
    }),
    prisma.game.findMany({
      where: {
        OR: [
          { id: { in: GAME_FIXTURES.map((game) => game.id) } },
          { slug: { in: GAME_FIXTURES.map((game) => game.slug) } },
        ],
      },
      select: { id: true, slug: true, studio_id: true },
    }),
    prisma.store.findMany({
      where: {
        OR: [
          { id: { in: OUTLET_FIXTURES.map((outlet) => outlet.id) } },
          { slug: { in: OUTLET_FIXTURES.map((outlet) => outlet.slug) } },
        ],
      },
      select: { id: true, slug: true, owner_id: true },
    }),
  ]);

  for (const user of users) {
    if (
      user.id !== OWNER_FIXTURE.id ||
      user.username !== OWNER_FIXTURE.username ||
      user.email !== OWNER_FIXTURE.email
    ) {
      collision("user", user);
    }
  }

  const studioById = new Map(
    STUDIO_FIXTURES.map((studio) => [studio.id, studio]),
  );
  for (const studio of studios) {
    const expected = studioById.get(studio.id);
    if (!expected || expected.slug !== studio.slug) {
      collision("studio", studio);
    }
  }

  const gameById = new Map(GAME_FIXTURES.map((game) => [game.id, game]));
  const gameBySlug = new Map(GAME_FIXTURES.map((game) => [game.slug, game]));
  for (const game of games) {
    const expected = gameById.get(game.id);
    if (
      !expected ||
      expected !== gameBySlug.get(game.slug) ||
      game.studio_id !== expected.studioId
    ) {
      collision("game", game);
    }
  }

  const outletById = new Map(
    OUTLET_FIXTURES.map((outlet) => [outlet.id, outlet]),
  );
  for (const outlet of outlets) {
    const expected = outletById.get(outlet.id);
    if (
      !expected ||
      expected.slug !== outlet.slug ||
      outlet.owner_id !== OWNER_FIXTURE.id
    ) {
      collision("Outlet", outlet);
    }
  }
}

function collision(label: string, row: object): never {
  throw new Error(
    `Refusing to overwrite a non-fixture ${label}: ${JSON.stringify(row)}`,
  );
}

async function ensureOwner(): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { id: OWNER_FIXTURE.id },
  });
  const requiredFeatures = [
    ...new Set([
      ...authorization.ACTIVATED_USER_FEATURES,
      ...MEMBER_PERMISSIONS,
      ...STORE_OWNER_FEATURES,
    ]),
  ];

  if (!existing) {
    await prisma.user.create({
      data: {
        ...OWNER_FIXTURE,
        password: null,
        features: requiredFeatures,
        created_at: FIXTURE_TIMESTAMP,
        updated_at: FIXTURE_TIMESTAMP,
      },
    });
    return;
  }

  const missingFeatures = requiredFeatures.filter(
    (feature) => !existing.features.includes(feature),
  );
  if (missingFeatures.length > 0) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { features: { push: missingFeatures } },
    });
  }
}

async function ensureStudios(): Promise<void> {
  for (const studio of STUDIO_FIXTURES) {
    const existing = await prisma.studio.findUnique({
      where: { id: studio.id },
    });
    if (!existing) {
      await prisma.studio.create({
        data: {
          ...studio,
          logo_url: null,
          is_publisher: false,
          owner_id: OWNER_FIXTURE.id,
          created_at: FIXTURE_TIMESTAMP,
          updated_at: FIXTURE_TIMESTAMP,
        },
      });
      continue;
    }

    const matches =
      existing.name === studio.name &&
      existing.description === studio.description &&
      existing.logo_url === null &&
      existing.is_publisher === false &&
      existing.owner_id === OWNER_FIXTURE.id;
    if (!matches) {
      await prisma.studio.update({
        where: { id: studio.id },
        data: {
          name: studio.name,
          description: studio.description,
          logo_url: null,
          is_publisher: false,
          owner_id: OWNER_FIXTURE.id,
          updated_at: FIXTURE_TIMESTAMP,
        },
      });
    }
  }
}

async function ensureGames(): Promise<void> {
  const studioNameById = new Map(
    STUDIO_FIXTURES.map((studio) => [studio.id, studio.name]),
  );

  for (const game of GAME_FIXTURES) {
    const studioName = studioNameById.get(game.studioId);
    if (!studioName) {
      throw new Error(`No fixture studio for ${game.slug}.`);
    }

    const stableDate = new Date(game.createdAt);
    const commonData = {
      studio_id: game.studioId,
      publisher_id: null,
      title: game.title,
      slug: game.slug,
      description: game.description,
      detailed_description: game.detailedDescription,
      launch_date: new Date(game.launchDate),
      status: "ACTIVE" as const,
      price: new Prisma.Decimal(game.price),
      base_price: new Prisma.Decimal(game.basePrice),
      discount_label: game.discountLabel,
      tags: [...game.tags],
      developer_name: studioName,
      publisher_name: studioName,
      steam_app_id: null,
      steam_price: null,
      steam_original_price: null,
      steam_discount_percent: null,
      steam_price_currency: null,
      steam_price_captured_at: null,
      meta_tags: {
        category: game.category,
        rating: "Everyone 10+",
        languages: ["English", "Português (Brasil)"],
        keywords: [...game.tags],
        platforms: ["Windows", "macOS", "Linux"],
      },
      media: {
        banner: game.bannerUrl,
        screenshots: [game.bannerUrl],
        videos: [],
      },
      social_links: {
        website: `https://example.com/games/${game.slug}`,
      },
      requirements: {
        minimum: {
          os: "Windows 10, macOS 13, or 64-bit Linux",
          processor: "Quad-core 2.5 GHz",
          memory: "8 GB RAM",
          graphics: "DirectX 11 / Metal compatible",
          storage: "6 GB available space",
        },
      },
      positive_reviews: game.positiveReviews,
      negative_reviews: game.negativeReviews,
      review_score: game.reviewScore,
      created_at: stableDate,
      updated_at: stableDate,
    } satisfies Prisma.GameUncheckedCreateInput;

    await prisma.game.upsert({
      where: { id: game.id },
      create: { id: game.id, ...commonData },
      update: commonData,
    });

    const localizationData = {
      game_id: game.id,
      locale: "pt-BR",
      title: game.ptBr.title,
      description: game.ptBr.description,
      detailed_description: game.ptBr.detailedDescription,
      source: "FALLBACK" as const,
      created_at: stableDate,
      updated_at: stableDate,
    };
    await ensureLocalization(game.localizationId, localizationData);
  }
}

async function ensureLocalization(
  id: string,
  data: Prisma.GameLocalizationUncheckedCreateInput,
): Promise<void> {
  const [byId, byGameAndLocale] = await Promise.all([
    prisma.gameLocalization.findUnique({ where: { id } }),
    prisma.gameLocalization.findUnique({
      where: {
        game_id_locale: { game_id: data.game_id, locale: data.locale },
      },
    }),
  ]);

  if (byId && byId.id !== byGameAndLocale?.id) {
    collision("game localization", byId);
  }
  if (byGameAndLocale && byGameAndLocale.id !== id) {
    collision("game localization", byGameAndLocale);
  }

  await prisma.gameLocalization.upsert({
    where: { id },
    create: { id, ...data },
    update: data,
  });
}

async function ensureOutletDraft(outlet: OutletFixture): Promise<boolean> {
  const store = await prisma.store.findUnique({ where: { id: outlet.id } });

  if (!store) {
    await prisma.store.create({
      data: {
        id: outlet.id,
        slug: outlet.slug,
        owner_id: OWNER_FIXTURE.id,
        ...storePresentationData(outlet),
        status: "DRAFT",
        catalog_mode: "SELECTED",
        published_revision_id: null,
        last_published_revision_id: null,
        published_at: null,
        last_published_at: null,
        draft_revision: 1,
        commission_rate: null,
        created_at: FIXTURE_TIMESTAMP,
        updated_at: FIXTURE_TIMESTAMP,
      },
    });
    return true;
  }

  if (
    store.catalog_mode !== "SELECTED" ||
    !presentationMatches(store, outlet)
  ) {
    await prisma.store.update({
      where: { id: outlet.id },
      data: {
        ...storePresentationData(outlet),
        catalog_mode: "SELECTED",
        draft_revision: { increment: 1 },
      },
    });
  }

  return false;
}

async function ensurePublishedOutlet(
  outlet: OutletFixture,
  created: boolean,
): Promise<PublicationResult> {
  // Curation mutations advance the draft ETag, so reload immediately before
  // comparing/publishing rather than carrying the value from draft creation.
  const store = await prisma.store.findUniqueOrThrow({
    where: { id: outlet.id },
  });
  await assertExactOutletDraft(store, outlet);

  const publishedRevision = store.published_revision_id
    ? await prisma.storeRevision.findUnique({
        where: { id: store.published_revision_id },
      })
    : null;
  const alreadyPublished =
    store.status === "PUBLISHED" &&
    store.published_at !== null &&
    publishedRevision !== null &&
    presentationMatches(publishedRevision, outlet) &&
    curationMatches(publishedRevision, expectedCuration(outlet));

  if (alreadyPublished) {
    return created ? "created" : "unchanged";
  }

  await storeModel.changePublication(
    store.id,
    OWNER_FIXTURE.id,
    "publish",
    store.draft_revision,
  );
  return created ? "created" : "published";
}

function storePresentationData(outlet: OutletFixture) {
  return {
    name: outlet.name,
    description: outlet.description,
    logo_url: outlet.logo_url,
    theme_key: outlet.theme_key,
    layout_preset: outlet.layout_preset,
    tagline: outlet.tagline,
    cover_url: outlet.cover_url,
    social_links: outlet.social_links,
    brand_tokens: outlet.brand_tokens,
  } satisfies Pick<
    Prisma.StoreUncheckedCreateInput,
    | "name"
    | "description"
    | "logo_url"
    | "theme_key"
    | "layout_preset"
    | "tagline"
    | "cover_url"
    | "social_links"
    | "brand_tokens"
  >;
}

function presentationMatches(
  row: Store | StoreRevision,
  outlet: OutletFixture,
): boolean {
  if ("presentation" in row) {
    const presentation = row.presentation as Record<string, unknown>;
    return (
      row.name === outlet.name &&
      row.description === outlet.description &&
      row.logo_url === outlet.logo_url &&
      presentation.version === STORE_PRESENTATION_VERSION &&
      presentation.theme_key === outlet.theme_key &&
      presentation.layout_preset === outlet.layout_preset &&
      presentation.tagline === outlet.tagline &&
      presentation.cover_image_url === outlet.cover_url &&
      isDeepStrictEqual(presentation.social_links, outlet.social_links) &&
      isDeepStrictEqual(presentation.brand_tokens, outlet.brand_tokens)
    );
  }

  return (
    row.name === outlet.name &&
    row.description === outlet.description &&
    row.logo_url === outlet.logo_url &&
    row.theme_key === outlet.theme_key &&
    row.layout_preset === outlet.layout_preset &&
    row.tagline === outlet.tagline &&
    row.cover_url === outlet.cover_url &&
    isDeepStrictEqual(row.social_links, outlet.social_links) &&
    isDeepStrictEqual(row.brand_tokens, outlet.brand_tokens)
  );
}

type ExpectedCuration = {
  featured_games: Array<{
    game_id: string;
    position: number;
    recommendation_reason: string;
  }>;
  tag_filters: Array<{ tag: string; mode: "WHITELIST" | "BLACKLIST" }>;
  game_overrides: never[];
};

function expectedCuration(outlet: OutletFixture): ExpectedCuration {
  const gameIdBySlug = new Map(
    GAME_FIXTURES.map((game) => [game.slug, game.id]),
  );

  return {
    featured_games: outlet.featured.map((featured) => {
      const gameId = gameIdBySlug.get(featured.gameSlug);
      if (!gameId) {
        throw new Error(`No fixture game for ${featured.gameSlug}.`);
      }
      return {
        game_id: gameId,
        position: featured.position,
        recommendation_reason: featured.recommendationReason,
      };
    }),
    tag_filters: outlet.filters.map(({ tag, mode }) => ({ tag, mode })),
    game_overrides: [],
  };
}

function curationMatches(
  revision: StoreRevision,
  expected: ExpectedCuration,
): boolean {
  return (
    isDeepStrictEqual(revision.featured_games, expected.featured_games) &&
    isDeepStrictEqual(revision.tag_filters, expected.tag_filters) &&
    isDeepStrictEqual(revision.game_overrides, expected.game_overrides)
  );
}

async function assertExactOutletDraft(
  store: Store,
  outlet: OutletFixture,
): Promise<void> {
  if (
    store.catalog_mode !== "SELECTED" ||
    !presentationMatches(store, outlet)
  ) {
    throw new Error(
      `Fixture Outlet ${outlet.slug} draft presentation or catalog mode changed; refusing to publish.`,
    );
  }

  const [filters, featured, overrides] = await Promise.all([
    prisma.storeTagFilter.findMany({ where: { store_id: outlet.id } }),
    prisma.storeFeaturedGame.findMany({ where: { store_id: outlet.id } }),
    prisma.storeGameOverride.findMany({ where: { store_id: outlet.id } }),
  ]);
  const expected = expectedCuration(outlet);
  const actualFilters = filters
    .map(({ tag, mode }) => ({ tag, mode }))
    .sort((left, right) => left.tag.localeCompare(right.tag));
  const expectedFilters = [...expected.tag_filters].sort((left, right) =>
    left.tag.localeCompare(right.tag),
  );
  const actualFeatured = featured
    .map(({ game_id, position, recommendation_reason }) => ({
      game_id,
      position,
      recommendation_reason,
    }))
    .sort((left, right) => left.position - right.position);
  const expectedFeatured = [...expected.featured_games].sort(
    (left, right) => left.position - right.position,
  );

  assertExactFixtureState(
    `${outlet.slug} tag filters`,
    actualFilters,
    expectedFilters,
  );
  assertExactFixtureState(
    `${outlet.slug} featured games`,
    actualFeatured,
    expectedFeatured,
  );
  assertExactFixtureState(
    `${outlet.slug} game overrides`,
    overrides.map(({ id }) => id).sort(),
    [],
  );
}

async function ensureCuration(): Promise<void> {
  const gameIdBySlug = new Map(
    GAME_FIXTURES.map((game) => [game.slug, game.id]),
  );
  const expectedFilters = OUTLET_FIXTURES.flatMap((outlet) =>
    outlet.filters.map((filter) => ({ ...filter, storeId: outlet.id })),
  );
  const expectedFeatured = OUTLET_FIXTURES.flatMap((outlet) =>
    outlet.featured.map((featured) => ({ ...featured, storeId: outlet.id })),
  );

  const [existingFilters, existingFeatured, existingOverrides] =
    await Promise.all([
      prisma.storeTagFilter.findMany({
        where: {
          OR: [
            { id: { in: expectedFilters.map((filter) => filter.id) } },
            { store_id: { in: OUTLET_FIXTURES.map((outlet) => outlet.id) } },
          ],
        },
      }),
      prisma.storeFeaturedGame.findMany({
        where: {
          OR: [
            { id: { in: expectedFeatured.map((featured) => featured.id) } },
            { store_id: { in: OUTLET_FIXTURES.map((outlet) => outlet.id) } },
          ],
        },
      }),
      prisma.storeGameOverride.findMany({
        where: {
          store_id: { in: OUTLET_FIXTURES.map((outlet) => outlet.id) },
        },
      }),
    ]);

  const filterById = new Map(
    expectedFilters.map((filter) => [filter.id, filter]),
  );
  for (const filter of existingFilters) {
    const expected = filterById.get(filter.id);
    if (
      expected &&
      (filter.store_id !== expected.storeId || filter.tag !== expected.tag)
    ) {
      collision("Outlet tag filter", filter);
    }
  }

  const featuredById = new Map(
    expectedFeatured.map((featured) => [featured.id, featured]),
  );
  for (const row of existingFeatured) {
    const expected = featuredById.get(row.id);
    const expectedGameId = expected
      ? gameIdBySlug.get(expected.gameSlug)
      : undefined;
    if (
      expected &&
      (row.store_id !== expected.storeId || row.game_id !== expectedGameId)
    ) {
      collision("Outlet Featured row", row);
    }
  }

  for (const outlet of OUTLET_FIXTURES) {
    const desiredFilters = expectedFilters.filter(
      (filter) => filter.storeId === outlet.id,
    );
    const currentFilters = existingFilters.filter(
      (filter) => filter.store_id === outlet.id,
    );
    const filtersMatch =
      currentFilters.length === desiredFilters.length &&
      desiredFilters.every((filter) => {
        const row = currentFilters.find(
          (candidate) => candidate.id === filter.id,
        );
        return row?.mode === filter.mode;
      });

    const desiredFeatured = expectedFeatured.filter(
      (featured) => featured.storeId === outlet.id,
    );
    const currentFeatured = existingFeatured.filter(
      (featured) => featured.store_id === outlet.id,
    );
    const currentOverrides = existingOverrides.filter(
      (override) => override.store_id === outlet.id,
    );
    const selectionMatches =
      currentFeatured.length === desiredFeatured.length &&
      desiredFeatured.every((featured) => {
        const row = currentFeatured.find(
          (candidate) => candidate.id === featured.id,
        );
        return (
          row?.position === featured.position &&
          row.recommendation_reason === featured.recommendationReason
        );
      });

    if (filtersMatch && selectionMatches && currentOverrides.length === 0) {
      continue;
    }

    await prisma.$transaction(async (transaction) => {
      if (!filtersMatch) {
        await transaction.storeTagFilter.deleteMany({
          where:
            desiredFilters.length > 0
              ? {
                  store_id: outlet.id,
                  id: { notIn: desiredFilters.map((filter) => filter.id) },
                }
              : { store_id: outlet.id },
        });
        for (const filter of desiredFilters) {
          const data = {
            store_id: outlet.id,
            tag: filter.tag,
            mode: filter.mode,
            updated_at: FIXTURE_TIMESTAMP,
          };
          await transaction.storeTagFilter.upsert({
            where: { id: filter.id },
            create: {
              id: filter.id,
              ...data,
              created_at: FIXTURE_TIMESTAMP,
            },
            update: data,
          });
        }
      }

      if (!selectionMatches && currentFeatured.length > 0) {
        await transaction.storeFeaturedGame.updateMany({
          where: { id: { in: currentFeatured.map((row) => row.id) } },
          data: { position: { increment: 1000 } },
        });
      }

      if (!selectionMatches) {
        await transaction.storeFeaturedGame.deleteMany({
          where:
            desiredFeatured.length > 0
              ? {
                  store_id: outlet.id,
                  id: { notIn: desiredFeatured.map((row) => row.id) },
                }
              : { store_id: outlet.id },
        });
        for (const featured of desiredFeatured) {
          const gameId = gameIdBySlug.get(featured.gameSlug);
          if (!gameId) {
            throw new Error(`No fixture game for ${featured.gameSlug}.`);
          }
          const data = {
            store_id: outlet.id,
            game_id: gameId,
            position: featured.position,
            recommendation_reason: featured.recommendationReason,
            updated_at: FIXTURE_TIMESTAMP,
          };
          await transaction.storeFeaturedGame.upsert({
            where: { id: featured.id },
            create: {
              id: featured.id,
              ...data,
              created_at: FIXTURE_TIMESTAMP,
            },
            update: data,
          });
        }
      }

      if (currentOverrides.length > 0) {
        await transaction.storeGameOverride.deleteMany({
          where: { store_id: outlet.id },
        });
      }

      // Curation is part of the draft and immutable published snapshot. Mirror
      // the model-layer lifecycle with one ETag advance for this reconciliation.
      await transaction.store.update({
        where: { id: outlet.id },
        data: { draft_revision: { increment: 1 } },
      });
    });
  }
}

function parseOrigin(): string {
  const raw =
    process.argv
      .slice(2)
      .find((argument) => argument.startsWith("--origin="))
      ?.slice("--origin=".length) ?? DEFAULT_ORIGIN;
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("--origin must be an HTTP(S) URL.");
  }
  return url.toString().replace(/\/$/, "");
}

function printSummary(results: ReadonlyMap<string, PublicationResult>): void {
  const origin = parseOrigin();

  console.log("");
  console.log("Outlet preset visual-QA showcase is ready.");
  console.log(`Owner: ${OWNER_FIXTURE.email} (${OWNER_FIXTURE.id})`);
  console.log(`Catalog: ${GAME_FIXTURES.length} ACTIVE games with HTTPS art`);
  console.log("");
  console.log("Responsive public URLs:");
  for (const outlet of OUTLET_FIXTURES) {
    const label = outlet.layout_preset.padEnd(9, " ");
    console.log(
      `  ${label} ${origin}/store/${outlet.slug} [${results.get(outlet.slug)}]`,
    );
  }
  console.log("");
  console.log("Portuguese locale URLs:");
  for (const outlet of OUTLET_FIXTURES) {
    console.log(`  ${origin}/pt-BR/store/${outlet.slug}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error("Failed to seed Outlet preset visual-QA fixtures:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
