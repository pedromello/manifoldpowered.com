import { prisma } from "infra/database";

export async function regionalSteamOffers(
  gameIds: string[],
  requestedCurrency: string,
) {
  if (gameIds.length === 0) return new Map();

  const offers = await prisma.gameExternalOffer.findMany({
    where: { game_id: { in: gameIds }, provider: "STEAM" },
    orderBy: [{ captured_at: "desc" }, { country: "asc" }],
  });

  const offersByGame = new Map<string, typeof offers>();
  for (const offer of offers) {
    const candidates = offersByGame.get(offer.game_id) ?? [];
    candidates.push(offer);
    offersByGame.set(offer.game_id, candidates);
  }
  return new Map(
    gameIds.flatMap((gameId) => {
      const candidates = offersByGame.get(gameId) ?? [];
      const selected =
        candidates.find(
          (offer) => offer.currency === requestedCurrency.toUpperCase(),
        ) ??
        candidates.find((offer) => offer.currency === "USD") ??
        candidates[0];

      return selected ? [[gameId, selected] as const] : [];
    }),
  );
}

const externalOffer = { regionalSteamOffers };

export default externalOffer;
