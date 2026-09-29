import { renderToStaticMarkup } from "react-dom/server";
import { useRouter } from "next/router";
import { GameFeatures } from "components/store/GameFeatures";
import { I18nProvider } from "lib/i18n";

jest.mock("next/router", () => ({ useRouter: jest.fn() }));
test.each(["en", "pt-BR"])(
  "only confirmed resources render in %s",
  (locale) => {
    jest
      .mocked(useRouter)
      .mockReturnValue({ locale } as ReturnType<typeof useRouter>);
    const render = (meta: unknown) =>
      renderToStaticMarkup(
        <I18nProvider>
          <GameFeatures meta={meta} />
        </I18nProvider>,
      );
    expect(render({})).toBe("");
    expect(render({ features: { multiplayer: false } })).toBe("");
    const markup = render({
      features: {
        single_player: true,
        multiplayer: true,
        players: {
          system: { min: 1, max: null },
          local: { min: 2, max: 4 },
          online: { min: 1, max: 4 },
        },
      },
    });
    expect(markup).toContain(
      locale === "pt-BR" ? "Multijogador" : "Multiplayer",
    );
    expect(markup).toContain(
      locale === "pt-BR"
        ? "Comunicação local entre consoles"
        : "Local wireless",
    );
    expect(markup).toContain("2–4");
    expect(markup).toContain("1–4");
    expect(markup).toContain(
      locale === "pt-BR" ? "Pelo menos 1" : "At least 1",
    );
    expect(markup).not.toContain("controle");
    expect(markup).not.toContain("controller");
  },
);
