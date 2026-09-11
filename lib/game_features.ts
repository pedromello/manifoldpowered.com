import { z } from "zod";

export const playerCountSchema = z
  .object({
    min: z.number().int().min(1).max(10000).nullish(),
    max: z.number().int().min(1).max(10000).nullish(),
  })
  .refine(
    (value) => value.min == null || value.max == null || value.min <= value.max,
  );

export const gameFeaturesSchema = z.object({
  single_player: z.boolean().optional(),
  multiplayer: z.boolean().optional(),
  controller: z.enum(["full", "partial"]).optional(),
  players: z
    .object({
      system: playerCountSchema.optional(),
      local: playerCountSchema.optional(),
      online: playerCountSchema.optional(),
    })
    .optional(),
});
export type GameFeatures = z.infer<typeof gameFeaturesSchema>;

export function readGameFeatures(meta: unknown): GameFeatures {
  const parsed = z
    .object({ features: gameFeaturesSchema.optional() })
    .safeParse(meta);
  return parsed.success ? (parsed.data.features ?? {}) : {};
}

export function mergeGameFeatures(
  previous: unknown,
  incoming: GameFeatures,
): GameFeatures {
  const old = readGameFeatures(previous);
  return {
    ...old,
    ...incoming,
    ...(old.players || incoming.players
      ? { players: { ...old.players, ...incoming.players } }
      : {}),
  };
}

export function nintendoFeatures(counts: unknown): GameFeatures {
  const source = z.record(z.string(), z.unknown()).safeParse(counts);
  if (!source.success) return {};
  const players: NonNullable<GameFeatures["players"]> = {};
  for (const key of ["system", "local", "online"] as const) {
    const range = playerCountSchema.safeParse(source.data[key]);
    if (range.success && (range.data.min != null || range.data.max != null))
      players[key] = range.data;
  }
  if (!Object.keys(players).length) return {};
  const ranges = Object.values(players);
  return {
    players,
    ...(players.system?.min === 1 ? { single_player: true } : {}),
    ...(ranges.some((range) => (range?.max ?? range?.min ?? 0) > 1)
      ? { multiplayer: true }
      : {}),
  };
}

export function steamFeatures(data: {
  categories?: { id: number }[];
  controller_support?: string;
}): GameFeatures {
  const ids = new Set(data.categories?.map((category) => category.id));
  const controller =
    data.controller_support === "full" || ids.has(28)
      ? "full"
      : data.controller_support === "partial" || ids.has(18)
        ? "partial"
        : undefined;
  return {
    ...(ids.has(2) ? { single_player: true } : {}),
    ...([1, 9, 20, 24, 27, 36, 37, 38, 39].some((id) => ids.has(id))
      ? { multiplayer: true }
      : {}),
    ...(controller ? { controller } : {}),
  };
}
