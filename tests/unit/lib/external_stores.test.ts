import {
  externalStores,
  externalImportStatusUrl,
  getExternalStore,
} from "lib/external_stores";
import { ptBR } from "lib/i18n/pt-BR";

test("every registered store has Portuguese text for the shared UI", () => {
  const missing = Object.values(externalStores).flatMap((store) =>
    Object.values(store.messages).filter(
      (message) => !Object.prototype.hasOwnProperty.call(ptBR, message),
    ),
  );
  expect(missing).toEqual([]);
});

test("store definitions normalize references without changing the legacy API fields", () => {
  const steam = getExternalStore("steam");
  const nintendo = getExternalStore("nintendo");
  expect(
    steam.normalizeReference("https://store.steampowered.com/app/400/Portal/"),
  ).toBe("400");
  expect(steam.normalizeReference(" 620 ")).toBe("620");
  const url =
    "https://www.nintendo.com/pt-br/store/products/hollow-knight-switch/";
  expect(nintendo.normalizeReference(`${url}?utm_source=demo`)).toBe(url);
  expect(
    nintendo.normalizeReference(url.replace("www.nintendo.com", "fake.test")),
  ).toBeNull();
  expect(
    new URL(
      externalImportStatusUrl("nintendo", url, {
        operationId: "opaque&id",
        locale: "pt-BR",
      }),
      "https://manifold.test",
    ).searchParams.get("operation_id"),
  ).toBe("opaque&id");
  expect(
    new URL(
      externalImportStatusUrl("steam", "400"),
      "https://manifold.test",
    ).searchParams.get("steam_app_id"),
  ).toBe("400");
});
