import type { NextApiRequest, NextApiResponse } from "next";
import controller from "infra/controller";
import { ServiceError } from "infra/errors";
import authorization from "models/authorization";
import {
  createExternalImportController,
  type ExternalImportControllerAdapter,
} from "infra/external_import_controller";
import type { ExternalRefreshInfo } from "lib/external_refresh";

type FixtureGame = { status: string; slug: string; internal: string };
type Adapter = ExternalImportControllerAdapter<
  { source: string },
  { id: string },
  FixtureGame
>;
type Result = Awaited<ReturnType<Adapter["status"]>>;

const game: FixtureGame = {
  status: "ONLY_DISPLAY",
  slug: "fixture-game",
  internal: "must never be public",
};

function refresh(state: ExternalRefreshInfo["state"]): ExternalRefreshInfo {
  return {
    operation_id: "7d9ab2fa-8cf1-4207-86c9-cf1b040fd6b3",
    state,
    last_completed_at: null,
    next_allowed_at: null,
  };
}

function fixture(result: Result) {
  const adapter = {
    permission: "import:fixture_game",
    parseInput: jest.fn(() => ({ source: "fixture-source" })),
    parseStatus: jest.fn(() => ({ id: "fixture-operation" })),
    importGame: jest.fn(async () => result),
    status: jest.fn(async () => result),
    present: jest.fn(async (value: FixtureGame) => ({ slug: value.slug })),
  } satisfies Adapter;
  return { adapter, handler: createExternalImportController(adapter) };
}

function request(method = "POST", features = ["import:fixture_game"]) {
  return {
    method,
    url: "/api/v1/items/games/fixture-import",
    body: { source: "fixture-source" },
    query: { operation_id: "fixture-operation" },
    context: { user: { id: "fixture-user", features } },
  } as unknown as NextApiRequest;
}

function response() {
  const res = {
    setHeader: jest.fn(),
    status: jest.fn(),
    json: jest.fn(),
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as typeof res & NextApiResponse;
}

beforeEach(() => {
  jest
    .spyOn(controller, "injectAnonymousOrUser")
    .mockImplementation((_req, _res, next) => next());
  jest
    .spyOn(authorization, "can")
    .mockImplementation((user, feature) => user.features.includes(feature));
});

afterEach(() => {
  jest.restoreAllMocks();
});

test.each([
  { method: "POST", state: "updated", created: true, saved: true, code: 201 },
  { method: "POST", state: "updated", created: false, saved: true, code: 200 },
  { method: "POST", state: "cached", created: false, saved: true, code: 200 },
  {
    method: "POST",
    state: "in_progress",
    created: false,
    saved: false,
    code: 202,
  },
  {
    method: "POST",
    state: "in_progress",
    created: false,
    saved: true,
    code: 200,
  },
  {
    method: "GET",
    state: "in_progress",
    created: false,
    saved: false,
    code: 200,
  },
] as const)(
  "$method $state saved=$saved returns $code and preserves the public envelope",
  async ({ method, state, created, saved, code }) => {
    const result = {
      game: saved ? game : null,
      created,
      refresh: refresh(state),
    };
    const { adapter, handler } = fixture(result);
    const req = request(method);
    const res = response();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(code);
    expect(res.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "private, no-store",
    );
    expect(res.json).toHaveBeenCalledWith({
      ...(saved ? { slug: game.slug } : {}),
      refresh: result.refresh,
    });
    if (state === "in_progress")
      expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "2");
    if (method === "GET") {
      expect(adapter.status).toHaveBeenCalledWith({ id: "fixture-operation" });
      expect(adapter.importGame).not.toHaveBeenCalled();
      expect(adapter.parseInput).not.toHaveBeenCalled();
    } else {
      expect(adapter.importGame).toHaveBeenCalledWith(
        { source: "fixture-source" },
        { userId: "fixture-user", isAdmin: false },
      );
      expect(adapter.status).not.toHaveBeenCalled();
    }
  },
);

test.each(["POST", "GET"])(
  "%s requires the adapter permission before looking up data",
  async (method) => {
    const { adapter, handler } = fixture({
      game,
      created: false,
      refresh: null,
    });
    const res = response();
    await handler(request(method, []), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(adapter.parseInput).not.toHaveBeenCalled();
    expect(adapter.parseStatus).not.toHaveBeenCalled();
    expect(adapter.importGame).not.toHaveBeenCalled();
    expect(adapter.status).not.toHaveBeenCalled();
  },
);

test.each(["POST", "GET"])(
  "%s never presents a moderated game or its refresh metadata",
  async (method) => {
    const { adapter, handler } = fixture({
      game: { ...game, status: "INACTIVE" },
      created: false,
      refresh: refresh("updated"),
    });
    const res = response();
    await handler(request(method), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "This game is currently hidden from the catalog.",
    });
    expect(adapter.present).not.toHaveBeenCalled();
  },
);

test("admin context reaches the import strategy without skipping its execution", async () => {
  const { adapter, handler } = fixture({ game, created: false, refresh: null });
  await handler(
    request("POST", ["import:fixture_game", "read:game:any"]),
    response(),
  );
  expect(adapter.importGame).toHaveBeenCalledWith(
    { source: "fixture-source" },
    { userId: "fixture-user", isAdmin: true },
  );
});

test("capacity failures preserve Retry-After and the existing error response", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  const { adapter, handler } = fixture({ game, created: false, refresh: null });
  const error = new ServiceError({
    message: "Provider is busy",
    context: { retry_after: 2 },
  });
  adapter.importGame.mockRejectedValueOnce(error);
  const res = response();
  await handler(request(), res);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.setHeader).toHaveBeenCalledWith("Retry-After", 2);
  expect(res.json).toHaveBeenCalledWith(error);
  expect(adapter.present).not.toHaveBeenCalled();
});
