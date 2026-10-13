import type { NextApiRequest, NextApiResponse } from "next";
import library from "models/library";
import pricing from "models/pricing";
import handler from "pages/api/v1/library";

jest.mock("models/library", () => ({
  __esModule: true,
  default: { acquireGame: jest.fn() },
}));
jest.mock("models/game", () => ({
  __esModule: true,
  default: {
    findOneBySlug: jest.fn().mockResolvedValue({ id: "synthetic-game" }),
  },
}));
jest.mock("models/pricing", () => ({
  __esModule: true,
  default: { priceForOrFail: jest.fn(), priceFor: jest.fn() },
}));
jest.mock("models/region", () => ({
  __esModule: true,
  default: { currencyForRequest: jest.fn().mockResolvedValue("USD") },
}));
jest.mock("infra/controller", () => {
  const actual = jest.requireActual("infra/controller").default;
  return {
    __esModule: true,
    default: {
      ...actual,
      injectAnonymousOrUser: async (
        _req: unknown,
        _res: unknown,
        next: () => Promise<void>,
      ) => next(),
    },
  };
});
beforeEach(() => jest.clearAllMocks());
async function submit() {
  const req = {
    method: "POST",
    url: "/api/v1/library",
    headers: {},
    body: { slug: "synthetic-game" },
    query: {},
    context: { user: { id: "synthetic-buyer", features: ["create:library"] } },
  } as unknown as NextApiRequest;
  const res = {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  await handler(req, res as unknown as NextApiResponse);
  return res;
}
test.each(["USD", "BRL"])(
  "a paid game cannot bypass checkout through a %s price",
  async (paidCurrency) => {
    (pricing.priceForOrFail as jest.Mock).mockImplementation(
      async (_game: unknown, currency: string) => ({
        amount: { isZero: () => currency !== paidCurrency },
      }),
    );
    (pricing.priceFor as jest.Mock).mockImplementation(
      async (_game: unknown, currency: string) => ({
        amount: { greaterThan: () => currency === paidCurrency },
      }),
    );
    const res = await submit();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ checkout_required: true }),
    );
    expect(library.acquireGame).not.toHaveBeenCalled();
  },
);
test("free games retain direct acquisition", async () => {
  (pricing.priceForOrFail as jest.Mock).mockResolvedValue({
    amount: { isZero: () => true },
  });
  (pricing.priceFor as jest.Mock).mockResolvedValue(null);
  (library.acquireGame as jest.Mock).mockResolvedValue({
    id: "synthetic-acquisition",
    item_id: "synthetic-game",
  });
  const res = await submit();
  expect(res.status).toHaveBeenCalledWith(201);
  expect(library.acquireGame).toHaveBeenCalledTimes(1);
});
