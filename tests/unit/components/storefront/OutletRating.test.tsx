import { renderToStaticMarkup } from "react-dom/server";
import { OutletRatingBadge } from "components/store/OutletRatingBadge";
import { OutletRatingInput } from "components/store/OutletRatingInput";
import { OutletRatingFilter } from "components/storefront/OutletRatingFilter";
import { EMPTY_OUTLET_RATING_FILTER } from "lib/outlet-rating-filter";
import { I18nProvider } from "lib/i18n";

jest.mock("next/router", () => ({
  useRouter: () => ({ locale: "pt-BR" }),
}));

describe("Outlet score accessibility", () => {
  test("zero has an accessible score and is different from an absent rating", () => {
    const markup = renderToStaticMarkup(
      <OutletRatingBadge rating={{ scale: "STARS", value: 0 }} />,
    );
    expect(markup).toContain('aria-label="Creator rating: 0 out of 5 stars"');
    expect(markup).toContain("0/5");
    expect(renderToStaticMarkup(<OutletRatingBadge rating={null} />)).toBe("");
  });

  test("a half star has an accessible numeric description", () => {
    expect(
      renderToStaticMarkup(
        <OutletRatingBadge rating={{ scale: "STARS", value: 4.5 }} />,
      ),
    ).toContain('aria-label="Creator rating: 4.5 out of 5 stars"');
  });

  test.each([
    [{ scale: "TIER", value: "S+" }, "S+", "S+"],
    [{ scale: "TIER", value: "S-" }, "S−", "S-"],
    [{ scale: "TIER", value: "A" }, "A", "A"],
    [{ scale: "NUMERIC_10", value: 9.5 }, "9,5/10", "9,5/10"],
    [{ scale: "STARS", value: 4.5 }, "4,5/5", "4,5 de 5 estrelas"],
    [{ scale: "STARS", value: 0 }, "0/5", "0 de 5 estrelas"],
  ] as const)(
    "the compact %j score keeps its original scale and Portuguese accessible description",
    (rating, visibleScore, accessibleScore) => {
      const markup = renderToStaticMarkup(
        <I18nProvider>
          <OutletRatingBadge rating={rating} variant="inline" />
        </I18nProvider>,
      );
      expect(markup).toContain(
        `aria-label="Nota do criador: ${accessibleScore}"`,
      );
      expect(markup).toContain(">Nota</span>");
      expect(markup).toContain(`>${visibleScore}</span>`);
      expect(markup).not.toContain("<svg");
    },
  );

  test("compact cards omit the label as well as the score when unrated", () => {
    expect(renderToStaticMarkup(<OutletRatingBadge variant="inline" />)).toBe(
      "",
    );
  });

  test("numeric input keeps No rating distinct from selected zero", () => {
    const markup = renderToStaticMarkup(
      <OutletRatingInput
        scale="NUMERIC_10"
        value={{ scale: "NUMERIC_10", value: 0 }}
        onChange={() => undefined}
        label="Creator rating"
      />,
    );
    expect(markup).toContain('<option value="">No rating</option>');
    expect(markup).toContain('<option value="0" selected="">0/10</option>');
    expect(markup).toContain('<option value="9.5">9.5/10</option>');
  });

  test("tier input offers S+, S and S− as distinct values", () => {
    const markup = renderToStaticMarkup(
      <OutletRatingInput
        scale="TIER"
        value={{ scale: "TIER", value: "S" }}
        onChange={() => undefined}
        label="Creator rating"
      />,
    );
    expect(markup).toContain('<option value="S+">S+</option>');
    expect(markup).toContain('<option value="S" selected="">S</option>');
    expect(markup).toContain('<option value="S-">S−</option>');
  });

  test("incompatible published scale prompts clearing instead of displaying an interpreted score", () => {
    const markup = renderToStaticMarkup(
      <OutletRatingFilter
        scale="NUMERIC_10"
        filter={{ rating_scale: "STARS", rating_op: "eq", rating_value: "5" }}
        onChange={() => undefined}
      />,
    );
    expect(markup).toContain("does not match");
    expect(markup).toContain("Clear rating filter");
    expect(markup).not.toContain("<select");
  });

  test("unconfigured Outlets have no score filter", () => {
    expect(
      renderToStaticMarkup(
        <OutletRatingFilter
          scale={null}
          filter={EMPTY_OUTLET_RATING_FILTER}
          onChange={() => undefined}
        />,
      ),
    ).toBe("");
  });
});
