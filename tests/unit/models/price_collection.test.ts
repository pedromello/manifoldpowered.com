import steam from "infra/steam";
import nintendo from "infra/nintendo";
import playstation from "infra/playstation";
import { collectPrice } from "models/price_collection";
import { ServiceError, ValidationError } from "infra/errors";
import { retryDelay } from "lib/price_refresh";
jest.mock("infra/steam", () => ({
  __esModule: true,
  default: { fetchAppDetails: jest.fn() },
}));
jest.mock("infra/nintendo", () => ({
  __esModule: true,
  default: { fetchProduct: jest.fn() },
}));
jest.mock("infra/playstation", () => ({
  __esModule: true,
  default: { fetchProduct: jest.fn() },
}));
beforeEach(() => jest.resetAllMocks());
test.each(["BR", "US"] as const)(
  "Steam %s maps discount, regular price, free and unknown independently",
  async (country) => {
    const currency = country === "BR" ? "BRL" : "USD";
    const ref = {
      provider: "STEAM" as const,
      country,
      external_id: "123",
      url: null,
    };
    jest.mocked(steam.fetchAppDetails).mockResolvedValue({
      success: true,
      data: {
        name: "Fixture",
        price_overview: {
          currency,
          final: 1000,
          initial: 2000,
          discount_percent: 50,
        },
      },
    });
    expect(await collectPrice(ref)).toMatchObject({
      amount: "10",
      original_amount: "20",
      discount_percent: 50,
      currency,
    });
    jest.mocked(steam.fetchAppDetails).mockResolvedValue({
      success: true,
      data: {
        name: "Fixture",
        price_overview: {
          currency,
          final: 2000,
          initial: 2000,
          discount_percent: 0,
        },
      },
    });
    expect(await collectPrice(ref)).toMatchObject({
      amount: "20",
      discount_percent: 0,
    });
    jest.mocked(steam.fetchAppDetails).mockResolvedValue({
      success: true,
      data: { name: "Fixture", is_free: true },
    });
    expect(await collectPrice(ref)).toMatchObject({ amount: "0" });
    jest
      .mocked(steam.fetchAppDetails)
      .mockResolvedValue({ success: true, data: { name: "Fixture" } });
    expect(await collectPrice(ref)).toBeNull();
    jest.mocked(steam.fetchAppDetails).mockResolvedValue({ success: false });
    await expect(collectPrice(ref)).rejects.toMatchObject({
      name: "NotFoundError",
    });
  },
);
test.each(["BR", "US"] as const)(
  "Nintendo %s checks edition and preserves missing prices",
  async (country) => {
    const ref = {
      provider: "NINTENDO" as const,
      country,
      external_id: "70010000000001",
      url: "https://www.nintendo.com/us/store/products/fixture/",
    };
    const product = {
      nsuid: ref.external_id,
      url: ref.url,
      prices: {
        currency: country === "BR" ? "BRL" : "USD",
        finalPrice: 15,
        regularPrice: 30,
      },
    };
    jest.mocked(nintendo.fetchProduct).mockResolvedValue(product as never);
    expect(await collectPrice(ref)).toMatchObject({
      amount: "15",
      discount_percent: 50,
    });
    jest
      .mocked(nintendo.fetchProduct)
      .mockResolvedValue({ ...product, prices: null } as never);
    expect(await collectPrice(ref)).toBeNull();
    jest
      .mocked(nintendo.fetchProduct)
      .mockResolvedValue({ ...product, nsuid: "70010000000002" } as never);
    await expect(collectPrice(ref)).rejects.toBeInstanceOf(ValidationError);
  },
);
test.each(["BR", "US"] as const)(
  "PlayStation %s preserves expiry and checks product identity",
  async (country) => {
    const external_id = "UP0001-PPSA12345_00-FIXTURE000000001";
    const url = `https://store.playstation.com/${country === "BR" ? "pt-br" : "en-us"}/product/${external_id}`;
    const ref = { provider: "PLAYSTATION" as const, country, external_id, url };
    const expiry = new Date("2030-01-01");
    const product = {
      id: external_id,
      url,
      prices: {
        amount: "10",
        original_amount: "20",
        discount_percent: 50,
        expires_at: expiry,
      },
    };
    jest.mocked(playstation.fetchProduct).mockResolvedValue(product as never);
    expect(await collectPrice(ref)).toMatchObject({
      amount: "10",
      expires_at: expiry,
    });
    jest.mocked(playstation.fetchProduct).mockResolvedValue({
      ...product,
      prices: {
        amount: "20",
        original_amount: "20",
        discount_percent: 0,
        expires_at: null,
      },
    } as never);
    expect(await collectPrice(ref)).toMatchObject({
      amount: "20",
      expires_at: null,
      discount_percent: 0,
    });
    jest
      .mocked(playstation.fetchProduct)
      .mockResolvedValue({ ...product, id: "OTHER" } as never);
    await expect(collectPrice(ref)).rejects.toBeInstanceOf(ValidationError);
  },
);
test("wrong regional currency and malformed zero are rejected", async () => {
  jest.mocked(steam.fetchAppDetails).mockResolvedValue({
    success: true,
    data: {
      name: "Fixture",
      price_overview: { currency: "USD", initial: 0, final: 0 },
    },
  });
  await expect(
    collectPrice({
      provider: "STEAM",
      country: "BR",
      external_id: "123",
      url: null,
    }),
  ).rejects.toBeInstanceOf(ValidationError);
});
test("retry policy respects numeric/date Retry-After and skips permanent failures", () => {
  const error = Object.assign(new ServiceError({ context: "HTTP_429" }), {
    retryAfter: "60",
  });
  expect(retryDelay(error, 1)).toBe(60_000);
  error.retryAfter = "2030-01-01T00:01:00Z";
  expect(retryDelay(error, 1, Date.parse("2030-01-01T00:00:00Z"))).toBe(60_000);
  expect(retryDelay(new ServiceError({ context: "HTTP_503" }), 2)).toBe(2000);
  expect(retryDelay(new ServiceError({ context: "HTTP_403" }), 1)).toBeNull();
  expect(retryDelay(new ValidationError({}), 1)).toBeNull();
});
