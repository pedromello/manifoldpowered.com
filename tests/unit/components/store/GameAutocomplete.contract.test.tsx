import { useId, useState } from "react";
import useSWR from "swr";

import { GameAutocomplete } from "components/store/GameAutocomplete";

jest.mock("react", () => {
  const actual = jest.requireActual<typeof import("react")>("react");
  return {
    ...actual,
    useId: jest.fn(),
    useState: jest.fn(),
  };
});
jest.mock("swr", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("lib/i18n", () => ({
  useI18n: () => ({
    locale: "en",
    t: (message: string) => message,
  }),
}));

const mockUseId = jest.mocked(useId);
const mockUseState = jest.mocked(useState);
const mockUseSWR = jest.mocked(useSWR);

describe("GameAutocomplete search contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseId.mockReturnValue("game-search");
    mockUseState
      .mockReturnValueOnce(["hades", jest.fn()])
      .mockReturnValueOnce([true, jest.fn()])
      .mockReturnValueOnce([-1, jest.fn()]);
    mockUseSWR.mockReturnValue({
      data: { games: [] },
      error: undefined,
      isLoading: false,
    } as ReturnType<typeof useSWR>);
  });

  test("queries the public game catalog with GET semantics by default", async () => {
    const request = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ games: [] }),
    });
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: request,
    });

    GameAutocomplete({ onSelect: jest.fn() });

    expect(mockUseSWR).toHaveBeenCalledTimes(1);
    const [url, fetcher] = mockUseSWR.mock.calls[0];
    expect(url).toBe("/api/v1/games?q=hades&limit=5&locale=en");
    expect(String(url)).not.toContain("/api/v1/items/games");
    await expect(
      (fetcher as (value: string) => Promise<unknown>)(String(url)),
    ).resolves.toEqual({ games: [] });
    expect(request).toHaveBeenCalledWith(url);
    expect(request.mock.calls[0]).toHaveLength(1);
  });
});
