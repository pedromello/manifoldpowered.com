import { renderToStaticMarkup } from "react-dom/server";
import useSWR from "swr";
import { PriceRefreshPanel } from "components/backoffice/PriceRefreshPanel";
jest.mock("swr", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("lib/i18n", () => ({ useI18n: () => ({ locale: "pt-BR" }) }));
test("unconfigured executor disables start with an actionable explanation", () => {
  jest.mocked(useSWR).mockImplementation(
    (key) =>
      ({
        data:
          key === "/api/v1/backoffice/price-refresh"
            ? { configured: false, runs: [] }
            : undefined,
      }) as never,
  );
  const html = renderToStaticMarkup(<PriceRefreshPanel />);
  expect(html).toContain("executor ainda não foi configurado");
  expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Atualizar preços/);
});
test("reopened page restores persisted progress and failed regional report", () => {
  const run = {
    id: "run",
    provider: "ALL",
    status: "COMPLETED_WITH_ERRORS",
    created_at: "2026-11-02T12:00:00Z",
    total: 2,
    processed: 2,
    checked: 1,
    counts: { CHANGED: 1, FAILED: 1 },
  };
  jest.mocked(useSWR).mockImplementation(
    (key) =>
      ({
        data:
          key === "/api/v1/backoffice/price-refresh"
            ? { configured: true, runs: [run] }
            : {
                run,
                page: 1,
                pages: 1,
                items: [
                  {
                    id: "item",
                    title: "Fixture",
                    provider: "NINTENDO",
                    country: "BR",
                    status: "FAILED",
                    error_code: "NotFoundError",
                    before: { amount: "10", currency: "BRL" },
                    after: null,
                  },
                ],
              },
      }) as never,
  );
  const html = renderToStaticMarkup(<PriceRefreshPanel />);
  expect(html).toContain("Concluída com falhas");
  expect(html).toContain("Tentar falhas novamente");
  expect(html).toContain("Produto indisponível nesta região");
  expect(html).toContain("2/2");
});
