import { NextApiRequest, NextApiResponse } from "next";
import { desktopErrorHandlers } from "infra/desktop_api";

function response() {
  const body: { value?: unknown } = {};
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn((value: unknown) => {
      body.value = value;
      return value;
    }),
    setHeader: jest.fn(),
  } as unknown as NextApiResponse;
  return { body, res };
}

describe("desktop API error handling", () => {
  test("wraps unexpected failures in the desktop error envelope", () => {
    const { body, res } = response();
    const req = {
      method: "POST",
      headers: {},
      url: "/api/v1/desktop/sessions",
    } as unknown as NextApiRequest;
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    desktopErrorHandlers.onError(new Error("database secret"), req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(body.value).toEqual({
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "The desktop service is temporarily unavailable",
        retryable: true,
      },
    });
    consoleError.mockRestore();
  });

  test("wraps unsupported methods in the desktop error envelope", () => {
    const { body, res } = response();
    const req = { method: "PATCH" } as unknown as NextApiRequest;

    desktopErrorHandlers.onNoMatch(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(body.value).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Method PATCH is not allowed for this endpoint",
        retryable: false,
      },
    });
  });
});
