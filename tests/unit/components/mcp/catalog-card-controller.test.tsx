import type { App } from "@modelcontextprotocol/ext-apps";
import type {
  CatalogGame,
  CatalogReviewsResult,
} from "contracts/public-game-catalog";
import { catalogCardController as controller } from "components/mcp/catalog-card-controller";

jest.mock("@modelcontextprotocol/ext-apps", () => {
  const host = {
    callServerTool: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    getHostContext: jest.fn(),
    getHostCapabilities: jest.fn(),
    updateModelContext: jest.fn().mockResolvedValue({}),
    sendMessage: jest.fn().mockResolvedValue({}),
    openLink: jest.fn(),
    ontoolresult: undefined,
    ontoolinput: undefined,
    ontoolcancelled: undefined,
  };
  return {
    App: jest.fn(() => host),
    host,
    applyDocumentTheme: jest.fn(),
    applyHostStyleVariables: jest.fn(),
  };
});
type Host = {
  callServerTool: jest.Mock;
  connect: jest.Mock;
  getHostCapabilities: jest.Mock;
  updateModelContext: jest.Mock;
  sendMessage: jest.Mock;
  ontoolresult: App["ontoolresult"];
  ontoolinput: App["ontoolinput"];
  ontoolcancelled: App["ontoolcancelled"];
};
const { host } = jest.requireMock("@modelcontextprotocol/ext-apps") as {
  host: Host;
};
const game: CatalogGame = {
  slug: "game-a",
  title: "Game A",
  description: "Catalog data",
  tags: [],
  launch_date: null,
  media: { images: [], videos: [] },
  review_summary: {
    total: 0,
    positive: 0,
    negative: 0,
    source: "catalog_counters",
  },
};
const reviews: CatalogReviewsResult = {
  game,
  locale: "en",
  reviews: [],
  sample: { returned: 0, recommendation: "all", sort: "newest" },
  pagination: { page: 1, limit: 10, total: 0, pages: 0 },
};
const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
function receive(data: unknown) {
  host.ontoolresult?.({ structuredContent: data, content: [] });
}
beforeEach(async () => {
  jest.clearAllMocks();
  controller.back();
  controller.connect();
  await settle();
  host.getHostCapabilities.mockReturnValue({
    message: { text: {} },
    updateModelContext: { structuredContent: {} },
  });
  host.updateModelContext.mockResolvedValue({});
  host.sendMessage.mockResolvedValue({});
});
describe("Catalog card host-mediated flows", () => {
  test("initial result is reused and late selection cannot replace a newer host result", async () => {
    receive({
      games: [game],
      locale: "en",
      pagination: { page: 1, limit: 5, total: 1, pages: 1 },
    });
    expect(host.callServerTool).not.toHaveBeenCalled();
    let resolve!: (value: { structuredContent: unknown }) => void;
    host.callServerTool.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    controller.selectGame(game.slug);
    const next = { ...game, slug: "game-b", title: "Game B" };
    receive({ game: next, locale: "en" });
    resolve({ structuredContent: { game, locale: "en" } });
    await settle();
    expect(controller.getSnapshot().selected?.slug).toBe("game-b");
    expect(controller.getSnapshot().pending).toBe(false);
  });
  test("new host input/cancellation invalidates the pending request and clears stale media", async () => {
    receive({ game, locale: "en" });
    let resolve!: (value: { structuredContent: unknown }) => void;
    host.callServerTool.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    controller.selectGame("game-b");
    host.ontoolinput?.({ arguments: { slug: "game-c" } });
    expect(controller.getSnapshot().selected).toBeNull();
    host.ontoolcancelled?.({});
    resolve({ structuredContent: { game, locale: "en" } });
    await settle();
    expect(controller.getSnapshot()).toMatchObject({
      selected: null,
      pending: false,
    });
    expect(controller.getSnapshot().error).toBeTruthy();
  });
  test("reading and paging comments never starts a conversation; discussion explicitly sends current evidence", async () => {
    receive({ game, locale: "en" });
    host.callServerTool.mockResolvedValueOnce({ structuredContent: reviews });
    controller.readReviews(1, "all", "newest");
    await settle();
    expect(host.callServerTool).toHaveBeenCalledTimes(1);
    expect(host.callServerTool).toHaveBeenCalledWith({
      name: "get_game_reviews",
      arguments: {
        slug: game.slug,
        locale: "en",
        page: 1,
        recommendation: "all",
        sort: "newest",
      },
    });
    expect(host.updateModelContext).not.toHaveBeenCalled();
    expect(host.sendMessage).not.toHaveBeenCalled();
    const page2 = {
      ...reviews,
      pagination: { ...reviews.pagination, page: 2 },
    };
    host.callServerTool.mockResolvedValueOnce({ structuredContent: page2 });
    controller.loadReviews(2, "all", "newest");
    await settle();
    expect(host.sendMessage).not.toHaveBeenCalled();
    controller.discussReviews();
    await settle();
    expect(host.callServerTool).toHaveBeenCalledTimes(2);
    expect(host.updateModelContext).toHaveBeenCalledWith({
      structuredContent: { manifold_review_evidence: page2 },
    });
    expect(host.sendMessage).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toMatchObject({
      reviews: page2,
      pending: false,
      error: null,
    });
  });
  test("final selection is rendered without a second lookup", () => {
    receive({ games: [game], locale: "en" });
    expect(controller.getSnapshot()).toMatchObject({
      games: [game],
      selected: null,
      pending: false,
    });
    expect(host.callServerTool).not.toHaveBeenCalled();
  });
  test("same-game host input keeps the current game/evidence through loading and cancellation", () => {
    receive(reviews);
    host.ontoolinput?.({ arguments: { view: "reviews", slugs: [game.slug] } });
    expect(controller.getSnapshot()).toMatchObject({
      selected: game,
      reviews,
      pending: true,
    });
    host.ontoolcancelled?.({});
    expect(controller.getSnapshot()).toMatchObject({
      selected: game,
      reviews,
      pending: false,
    });
    expect(controller.getSnapshot().error).toBeTruthy();
    host.ontoolinput?.({ arguments: { view: "list", slugs: [game.slug] } });
    expect(controller.getSnapshot()).toMatchObject({
      selected: null,
      reviews: null,
      pending: true,
    });
  });
  test("rapid game changes clear previous media and ignore out-of-order results", async () => {
    receive({ game, locale: "en" });
    let resolveB!: (value: { structuredContent: unknown }) => void;
    let resolveC!: (value: { structuredContent: unknown }) => void;
    host.callServerTool.mockReturnValueOnce(
      new Promise((done) => {
        resolveB = done;
      }),
    );
    host.callServerTool.mockReturnValueOnce(
      new Promise((done) => {
        resolveC = done;
      }),
    );
    controller.selectGame("game-b");
    expect(controller.getSnapshot().selected).toBeNull();
    controller.selectGame("game-c");
    const current = { ...game, slug: "game-c", title: "Game C" };
    resolveC({ structuredContent: { game: current, locale: "en" } });
    await settle();
    resolveB({
      structuredContent: { game: { ...game, slug: "game-b" }, locale: "en" },
    });
    await settle();
    expect(controller.getSnapshot()).toMatchObject({
      selected: current,
      pending: false,
    });
  });
  test("same-game loading/failure preserves the game; explicit visibility denial removes it", async () => {
    receive({ game, locale: "en" });
    host.callServerTool.mockRejectedValueOnce(new Error("Network failure"));
    controller.readReviews(1, "all", "newest");
    expect(controller.getSnapshot()).toMatchObject({
      selected: game,
      pending: true,
    });
    await settle();
    expect(controller.getSnapshot()).toMatchObject({
      selected: game,
      pending: false,
    });
    expect(controller.getSnapshot().error).toBeTruthy();
    expect(host.sendMessage).not.toHaveBeenCalled();
    host.callServerTool.mockResolvedValueOnce({
      isError: true,
      content: [{ type: "text", text: "Game not found." }],
    });
    controller.readReviews(1, "all", "newest");
    await settle();
    expect(controller.getSnapshot()).toMatchObject({
      selected: null,
      reviews: null,
      games: null,
      pending: false,
    });
  });
  test.each(["unsupported", "context-rejected", "message-rejected"])(
    "host %s leaves reviews accessible without claiming success",
    async (failure) => {
      receive(reviews);
      if (failure === "unsupported")
        host.getHostCapabilities.mockReturnValue({});
      if (failure === "context-rejected")
        host.updateModelContext.mockRejectedValueOnce(new Error("Rejected"));
      if (failure === "message-rejected")
        host.sendMessage.mockResolvedValueOnce({ isError: true });
      controller.discussReviews();
      await settle();
      expect(controller.getSnapshot()).toMatchObject({
        reviews,
        pending: false,
      });
      expect(controller.getSnapshot().error).toContain("host did not accept");
      if (failure !== "message-rejected")
        expect(host.sendMessage).not.toHaveBeenCalled();
    },
  );
  test("new game during context acknowledgement prevents sending obsolete review request", async () => {
    receive(reviews);
    let resolve!: (value: object) => void;
    host.updateModelContext.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    controller.discussReviews();
    receive({ game: { ...game, slug: "game-b" }, locale: "en" });
    resolve({});
    await settle();
    expect(host.sendMessage).not.toHaveBeenCalled();
    expect(controller.getSnapshot().selected?.slug).toBe("game-b");
  });
});
