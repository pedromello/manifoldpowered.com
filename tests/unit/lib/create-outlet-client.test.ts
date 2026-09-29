import { createOutletSubmissionController } from "lib/create-outlet-client";

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function analyticsMock() {
  return {
    createStarted: jest.fn(),
    draftCreated: jest.fn(),
  };
}

describe("createOutletSubmissionController", () => {
  test("tracks the first explicit form change once without a request", () => {
    const analytics = analyticsMock();
    const request = jest.fn() as typeof fetch;
    const controller = createOutletSubmissionController({ request, analytics });

    expect(analytics.createStarted).not.toHaveBeenCalled();

    controller.start();
    controller.start();

    expect(analytics.createStarted).toHaveBeenCalledTimes(1);
    expect(analytics.createStarted).toHaveBeenCalledWith({
      funnelVersion: 1,
      entrySurface: "create_outlet",
    });
    expect(request).not.toHaveBeenCalled();
  });

  test("tracks explicit intent before the request and a confirmed draft after 201", async () => {
    const order: string[] = [];
    const analytics = analyticsMock();
    let capturedRequestInit: RequestInit | undefined;
    analytics.createStarted.mockImplementation(() => order.push("started"));
    analytics.draftCreated.mockImplementation(() => order.push("draft"));
    const request = jest.fn(async (_input, init?: RequestInit) => {
      capturedRequestInit = init;
      order.push("request");
      return jsonResponse(
        {
          slug: "quiet-arcade",
          status: "DRAFT",
          description: "A deliberate selection.",
          logo_url: null,
        },
        201,
      );
    }) as typeof fetch;
    const controller = createOutletSubmissionController({ request, analytics });

    const result = await controller.submit({
      name: "Quiet Arcade",
      description: "A deliberate selection.",
    });

    expect(result).toEqual({
      ok: true,
      status: 201,
      body: {
        slug: "quiet-arcade",
        status: "DRAFT",
        description: "A deliberate selection.",
        logo_url: null,
      },
    });
    expect(order).toEqual(["started", "request", "draft"]);
    expect(analytics.createStarted).toHaveBeenCalledWith({
      funnelVersion: 1,
      entrySurface: "create_outlet",
    });
    expect(analytics.draftCreated).toHaveBeenCalledWith({
      funnelVersion: 1,
      entrySurface: "create_outlet",
      hasDescription: true,
      hasLogo: false,
    });
    expect(JSON.parse(String(capturedRequestInit?.body))).toEqual({
      name: "Quiet Arcade",
      description: "A deliberate selection.",
    });
  });

  test("coalesces concurrent submits so double clicks emit and create once", async () => {
    const analytics = analyticsMock();
    let resolveRequest!: (response: Response) => void;
    const request = jest.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    ) as typeof fetch;
    const controller = createOutletSubmissionController({ request, analytics });
    const input = { name: "Quiet Arcade" };

    const first = controller.submit(input);
    const second = controller.submit(input);

    expect(second).toBe(first);
    expect(request).toHaveBeenCalledTimes(1);
    expect(analytics.createStarted).toHaveBeenCalledTimes(1);

    resolveRequest(
      jsonResponse({ slug: "quiet-arcade", status: "DRAFT" }, 201),
    );
    await Promise.all([first, second]);

    expect(analytics.draftCreated).toHaveBeenCalledTimes(1);
  });

  test("does not repeat create_started on retry and waits for confirmed success", async () => {
    const analytics = analyticsMock();
    const request = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "Try again" }, 503))
      .mockResolvedValueOnce(
        jsonResponse({ slug: "quiet-arcade", status: "DRAFT" }, 201),
      ) as typeof fetch;
    const controller = createOutletSubmissionController({ request, analytics });

    await controller.submit({ name: "Quiet Arcade" });
    expect(analytics.draftCreated).not.toHaveBeenCalled();

    await controller.submit({ name: "Quiet Arcade" });

    expect(request).toHaveBeenCalledTimes(2);
    expect(analytics.createStarted).toHaveBeenCalledTimes(1);
    expect(analytics.draftCreated).toHaveBeenCalledTimes(1);
  });

  test("does not call draft_created for an unconfirmed lifecycle state", async () => {
    const analytics = analyticsMock();
    const request = jest.fn(async () =>
      jsonResponse({ slug: "quiet-arcade", status: "PUBLISHED" }, 201),
    ) as typeof fetch;
    const controller = createOutletSubmissionController({ request, analytics });

    await controller.submit({ name: "Quiet Arcade" });

    expect(analytics.createStarted).toHaveBeenCalledTimes(1);
    expect(analytics.draftCreated).not.toHaveBeenCalled();
  });
});
