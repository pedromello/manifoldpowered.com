/** @jest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FeaturedVideo } from "components/store/FeaturedVideo";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const video = { provider: "YOUTUBE" as const, video_id: "g7QcidQx73s" };
test("shows the original video thumbnail and defers the player until click, without an external link", async () => {
  await act(async () => root.render(<FeaturedVideo video={video} />));
  expect(container.querySelector("iframe")).toBeNull();
  expect(container.querySelector("a")).toBeNull();
  expect(container.querySelector("img")?.src).toBe(
    "https://img.youtube.com/vi/g7QcidQx73s/maxresdefault.jpg",
  );
  await act(async () => container.querySelector("button")!.click());
  const frame = container.querySelector("iframe")!;
  expect(frame.src).toContain(
    "https://www.youtube-nocookie.com/embed/g7QcidQx73s",
  );
  expect(frame.getAttribute("referrerpolicy")).toBe(
    "strict-origin-when-cross-origin",
  );
  expect(container.querySelector("a")).toBeNull();
});
test.each(["error", "placeholder"])(
  "uses the standard video thumbnail when the HD thumbnail returns %s",
  async (failure) => {
    await act(async () => root.render(<FeaturedVideo video={video} />));
    const image = container.querySelector("img")!;
    if (failure === "placeholder")
      Object.defineProperty(image, "naturalWidth", { value: 120 });
    await act(async () =>
      image.dispatchEvent(new Event(failure === "error" ? "error" : "load")),
    );
    expect(container.querySelector("img")?.src).toBe(
      "https://img.youtube.com/vi/g7QcidQx73s/hqdefault.jpg",
    );
  },
);
test("keeps playback available when neither video thumbnail loads", async () => {
  await act(async () => root.render(<FeaturedVideo video={video} />));
  await act(async () =>
    container.querySelector("img")!.dispatchEvent(new Event("error")),
  );
  await act(async () =>
    container.querySelector("img")!.dispatchEvent(new Event("error")),
  );
  expect(container.querySelector("img")).toBeNull();
  await act(async () => container.querySelector("button")!.click());
  expect(container.querySelector("iframe")).not.toBeNull();
});
test("closes the teaser dialog and unmounts playback", async () => {
  await act(async () => root.render(<FeaturedVideo video={video} teaser />));
  expect(container.querySelector("img")?.src).toBe(
    "https://img.youtube.com/vi/g7QcidQx73s/maxresdefault.jpg",
  );
  expect(container.querySelector("a")).toBeNull();
  await act(async () => container.querySelector("button")!.click());
  expect(container.querySelector("dialog")?.hasAttribute("open")).toBe(true);
  expect(container.querySelector("iframe")).not.toBeNull();
  expect(container.querySelector("a")).toBeNull();
  await act(async () =>
    (
      container.querySelector('[aria-label="Close video"]') as HTMLButtonElement
    ).click(),
  );
  expect(container.querySelector("iframe")).toBeNull();
  expect(container.querySelector("dialog")?.hasAttribute("open")).toBe(false);
});
test("renders no empty slot for a missing video", async () => {
  await act(async () => root.render(<FeaturedVideo video={null} />));
  expect(container.innerHTML).toBe("");
});

test("preserves the configured start time in the player", async () => {
  await act(async () =>
    root.render(<FeaturedVideo video={{ ...video, start_seconds: 623 }} />),
  );
  await act(async () => container.querySelector("button")!.click());
  expect(
    new URL(container.querySelector("iframe")!.src).searchParams.get("start"),
  ).toBe("623");
});
test("resets playback when the same video changes to another segment", async () => {
  await act(async () =>
    root.render(<FeaturedVideo video={{ ...video, start_seconds: 623 }} />),
  );
  await act(async () => container.querySelector("button")!.click());
  await act(async () =>
    root.render(<FeaturedVideo video={{ ...video, start_seconds: 68 }} />),
  );
  expect(container.querySelector("iframe")).toBeNull();
  await act(async () => container.querySelector("button")!.click());
  expect(
    new URL(container.querySelector("iframe")!.src).searchParams.get("start"),
  ).toBe("68");
});
