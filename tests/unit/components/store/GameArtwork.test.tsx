import {
  Children,
  isValidElement,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  GameArtwork,
  type GameArtworkProps,
} from "components/store/GameArtwork";

jest.mock("react", () => {
  const actual = jest.requireActual<typeof import("react")>("react");
  return { ...actual, useState: jest.fn() };
});

type Element = ReactElement<Record<string, unknown>>;
let failedSrc: string | null;

function elements(node: ReactNode): Element[] {
  if (!isValidElement(node)) return [];
  const element = node as Element;
  return [
    element,
    ...Children.toArray(element.props.children as ReactNode).flatMap(elements),
  ];
}

function render(props: GameArtworkProps) {
  return elements(GameArtwork(props));
}

beforeEach(() => {
  failedSrc = null;
  jest.mocked(useState).mockImplementation((() => [
    failedSrc,
    (value: string | null) => {
      failedSrc = value;
    },
  ]) as typeof useState);
});

test("preserves the full named artwork and keeps its blurred duplicate decorative", () => {
  const tree = render({
    src: "https://example.com/artwork.jpg",
    alt: "Game cover",
    className: "aspect-[4/3]",
  });
  const images = tree.filter((element) => element.type === "img");
  const foreground = images.find((image) => image.props.alt === "Game cover")!;
  const background = images.find(
    (image) => image.props["aria-hidden"] === "true",
  )!;

  expect(images).toHaveLength(2);
  expect(foreground.props.src).toBe(background.props.src);
  expect(foreground.props.className).toContain("object-contain");
  expect(foreground.props.className).not.toMatch(/scale|blur|brightness|hover/);
  expect(background.props.alt).toBe("");
  expect(background.props.className).toContain("blur-[18px]");
  expect(background.props.className).toContain("brightness-[.45]");
  expect(background.props.className).toContain("scale-[1.15]");
  expect(tree[0].props.className).toContain("aspect-[4/3]");
});

test.each([undefined, "", "   "])(
  "missing source %p reserves its frame without requesting an image",
  (src) => {
    const tree = render({ src, alt: "Game cover", className: "h-20 w-32" });
    expect(tree.some((element) => element.type === "img")).toBe(false);
    expect(
      tree.find((element) => element.props.role === "img")?.props["aria-label"],
    ).toBe("Game cover");
    expect(tree[0].props.className).toContain("h-20 w-32");
  },
);

test("a broken image switches to the fallback and a different source can load", () => {
  const props = { src: "https://example.com/broken.jpg", alt: "Game cover" };
  const foreground = render(props).find(
    (element) => typeof element.props.onError === "function",
  )!;
  (foreground.props.onError as () => void)();

  const failedTree = render(props);
  expect(failedTree.some((element) => element.type === "img")).toBe(false);
  expect(
    failedTree.find((element) => element.props.role === "img")?.props[
      "aria-label"
    ],
  ).toBe("Game cover");

  const nextImages = render({
    ...props,
    src: "https://example.com/replacement.jpg",
  }).filter((element) => element.type === "img");
  expect(nextImages).toHaveLength(2);
  expect(
    nextImages.every(
      (image) => image.props.src === "https://example.com/replacement.jpg",
    ),
  ).toBe(true);
});

test("gallery mode shows one uncropped image over a neutral surface", () => {
  const tree = render({
    src: "https://example.com/screenshot.jpg",
    background: "neutral",
    loading: "eager",
    fill: true,
  });
  const images = tree.filter((element) => element.type === "img");
  expect(images).toHaveLength(1);
  expect(images[0].props.alt).toBe("");
  expect(images[0].props.loading).toBe("eager");
  expect(images[0].props.className).toContain("object-contain");
  expect(tree[0].props.className).toContain("absolute inset-0");
  expect(
    tree.some(
      (element) =>
        typeof element.props.className === "string" &&
        element.props.className.includes("bg-[#100d15]"),
    ),
  ).toBe(true);
});
