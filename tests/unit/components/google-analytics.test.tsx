/**
 * @jest-environment jsdom
 * @jest-environment-options {"url":"https://www.manifoldpowered.com","referrer":"https://example.com/private?token=secret"}
 */
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { GoogleAnalytics } from "components/GoogleAnalytics";

const mockRouter = { isReady: true, asPath: "/store", pathname: "/store" };
const mockEnvironment = { nodeEnv: "production" };
// Next's Jest transform inlines NODE_ENV as "test". Exercise the same pure
// environment gate with a controlled build environment for these effect tests.
jest.mock("lib/google-analytics", () => {
  const actual = jest.requireActual<typeof import("lib/google-analytics")>(
    "lib/google-analytics",
  );
  return {
    ...actual,
    isAnalyticsEnabled: (hostname: string, _environment: string, id: string) =>
      actual.isAnalyticsEnabled(hostname, mockEnvironment.nodeEnv, id),
  };
});
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));
jest.mock("next/script", () => ({
  __esModule: true,
  default: ({ src }: { src: string }) => <span data-google-tag-src={src} />,
}));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  mockEnvironment.nodeEnv = "production";
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  delete window.dataLayer;
  delete window.gtag;
  Object.assign(mockRouter, {
    isReady: true,
    asPath: "/store",
    pathname: "/store",
  });
  document.title = "Manifold";
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

function renderAnalytics() {
  act(() =>
    root.render(
      <StrictMode>
        <GoogleAnalytics />
      </StrictMode>,
    ),
  );
}

function commands() {
  return (window.dataLayer ?? []).map((entry) =>
    Array.from(entry as IArguments),
  );
}

test("initializes once and sends one sanitized view through StrictMode effect replay", () => {
  mockRouter.asPath = "/store?email=private%40example.com#secret";
  renderAnalytics();
  const queued = commands();
  expect(queued.filter(([command]) => command === "config")).toEqual([
    [
      "config",
      "G-VTZ55HBZVP",
      {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      },
    ],
  ]);
  expect(queued.filter(([command]) => command === "event")).toEqual([
    [
      "event",
      "page_view",
      {
        page_location: "https://www.manifoldpowered.com/store",
        page_title: "Manifold",
        page_referrer: "https://example.com/",
      },
    ],
  ]);
  expect(
    container
      .querySelector("[data-google-tag-src]")
      ?.getAttribute("data-google-tag-src"),
  ).toBe("https://www.googletagmanager.com/gtag/js?id=G-VTZ55HBZVP");
});

test("tracks client navigation once and ignores query-only and fragment-only changes", () => {
  renderAnalytics();
  mockRouter.asPath = "/item/example-game?token=secret";
  mockRouter.pathname = "/item/[slug]";
  renderAnalytics();
  mockRouter.asPath = "/item/example-game?token=other#private";
  renderAnalytics();
  const views = commands().filter(([command]) => command === "event");
  expect(views).toHaveLength(2);
  expect(views[1][2]).toEqual({
    page_location: "https://www.manifoldpowered.com/item/example-game",
    page_title: "Manifold",
    page_referrer: "https://www.manifoldpowered.com/store",
  });
});

test("redacts both the location and title on private dynamic routes", () => {
  Object.assign(mockRouter, {
    asPath:
      "/signup/activate/example-private-token?email=private%40example.com",
    pathname: "/signup/activate/[activation_token]",
  });
  document.title = "Activate example-private-token";
  renderAnalytics();
  expect(JSON.stringify(commands())).not.toContain("example-private-token");
  expect(JSON.stringify(commands())).not.toContain("private%40example.com");
});

test("development and a router that is not ready never queue analytics", () => {
  mockEnvironment.nodeEnv = "development";
  renderAnalytics();
  expect(commands()).toEqual([]);
  expect(container.querySelector("[data-google-tag-src]")).toBeNull();
  mockEnvironment.nodeEnv = "production";
  mockRouter.isReady = false;
  renderAnalytics();
  expect(commands()).toEqual([]);
});
