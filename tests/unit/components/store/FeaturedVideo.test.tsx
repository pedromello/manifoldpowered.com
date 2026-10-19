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
test("defers the player until click and always offers the canonical fallback", async () => {
  await act(async () => root.render(<FeaturedVideo video={video} />));
  expect(container.querySelector("iframe")).toBeNull();
  expect(container.querySelector("a")?.href).toBe(
    "https://www.youtube.com/watch?v=g7QcidQx73s",
  );
  await act(async () => container.querySelector("button")!.click());
  const frame = container.querySelector("iframe")!;
  expect(frame.src).toContain(
    "https://www.youtube-nocookie.com/embed/g7QcidQx73s",
  );
  expect(frame.getAttribute("referrerpolicy")).toBe(
    "strict-origin-when-cross-origin",
  );
});
test("closes the teaser dialog and unmounts playback", async () => {
  await act(async () => root.render(<FeaturedVideo video={video} teaser />));
  await act(async () => container.querySelector("button")!.click());
  expect(container.querySelector("dialog")?.hasAttribute("open")).toBe(true);
  expect(container.querySelector("iframe")).not.toBeNull();
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
