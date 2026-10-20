import { createPlayStationStrategy } from "models/external_import/playstation_strategy";
import { parsePlayStationProduct } from "infra/playstation";
import { NotFoundError, UnsupportedContentError } from "infra/errors";
import { playStationProductUrl } from "lib/playstation";
import {
  PLAYSTATION_ID,
  playstationFixture,
  playstationHtml,
} from "tests/fixtures/playstation";
const input = playStationProductUrl(PLAYSTATION_ID, "BR");
function product(country: "BR" | "US") {
  return parsePlayStationProduct(
    playstationHtml(playstationFixture(country)),
    playStationProductUrl(PLAYSTATION_ID, country),
  );
}
test("builds distinct PS5 identity, separate regional offers and plain text", async () => {
  const strategy = createPlayStationStrategy({
    fetchProduct: async (_id, country) => product(country),
  });
  const snapshot = await strategy.fetchSnapshot(
    strategy.parseReference(input),
    { regionalOutcomes: {}, failureOutcome: "SERVICE_ERROR" },
  );
  expect(snapshot.externalId).toBe(PLAYSTATION_ID);
  expect(snapshot.suggestedSlug).toContain("-ps5-");
  expect(snapshot.fields.meta_tags.platforms).toEqual(["PS5"]);
  expect(snapshot.fields.detailed_description).toBe(
    "Plan your campaign.\nChoose your fleet.",
  );
  expect(snapshot.fields).not.toHaveProperty("locale");
  expect(
    snapshot.offers.map(({ country, currency }) => [country, currency]),
  ).toEqual([
    ["BR", "BRL"],
    ["US", "USD"],
  ]);
});
test("keeps a successful region when the other is unavailable", async () => {
  const strategy = createPlayStationStrategy({
    fetchProduct: async (_id, country) => {
      if (country === "US")
        throw new NotFoundError({
          message: "Unavailable",
          action: "Check region",
        });
      return product(country);
    },
  });
  const audit = {
    regionalOutcomes: {},
    failureOutcome: "SERVICE_ERROR" as const,
  };
  const snapshot = await strategy.fetchSnapshot(
    strategy.parseReference(input),
    audit,
  );
  expect(snapshot.offers).toHaveLength(1);
  expect(audit.regionalOutcomes).toMatchObject({
    BR: "SUCCESS",
    US: "NotFoundError",
  });
});
test("does not import a different region when the submitted product is unsupported", async () => {
  const strategy = createPlayStationStrategy({
    fetchProduct: async (_id, country) => {
      if (country === "BR")
        throw new UnsupportedContentError({
          message: "Not a full game",
          action: "Choose full game",
        });
      return product(country);
    },
  });
  await expect(
    strategy.fetchSnapshot(strategy.parseReference(input), {
      regionalOutcomes: {},
      failureOutcome: "SERVICE_ERROR",
    }),
  ).rejects.toBeInstanceOf(UnsupportedContentError);
});
