import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { lookup } from "node:dns/promises";
import { get } from "node:https";
import {
  isPublicImageAddress,
  loadPublicRasterImage,
} from "lib/public-raster-image";

jest.mock("node:dns/promises", () => ({ lookup: jest.fn() }));
jest.mock("node:https", () => ({ get: jest.fn() }));

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
let status: number;
let headers: Record<string, string>;
let body: Buffer;
const connected = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  status = 200;
  headers = { "content-type": "image/png" };
  body = png;
  jest
    .mocked(lookup)
    .mockResolvedValue([{ address: "93.184.215.14", family: 4 }] as never);
  jest.mocked(get).mockImplementation((url, options, receive) => {
    const request = new EventEmitter();
    queueMicrotask(() => {
      (options as import("node:https").RequestOptions).lookup!(
        (url as URL).hostname,
        {},
        (error, address, family) => {
          if (error) return void request.emit("error", error);
          connected(address, family);
          const response = Object.assign(new PassThrough(), {
            statusCode: status,
            headers,
          });
          (receive as (response: unknown) => void)(response);
          response.end(body);
        },
      );
    });
    return request as never;
  });
});

test.each([
  "https://community.example/logo.png",
  "https://pbs.twimg.com/profile_images/example/avatar.png",
  "https://yt3.googleusercontent.com/public-avatar",
])("loads public raster logos without a domain allow-list: %s", async (url) => {
  await expect(loadPublicRasterImage(url)).resolves.toEqual({
    bytes: png,
    contentType: "image/png",
  });
  expect(connected).toHaveBeenCalledWith("93.184.215.14", 4);
  expect(get).toHaveBeenCalledWith(
    new URL(url),
    expect.objectContaining({ autoSelectFamily: false }),
    expect.any(Function),
  );
});

test.each([
  "127.0.0.1",
  "10.0.0.1",
  "172.16.0.1",
  "192.168.1.1",
  "169.254.169.254",
  "100.64.0.1",
  "0.0.0.0",
  "224.0.0.1",
  "::1",
  "fc00::1",
  "fe80::1",
  "::ffff:127.0.0.1",
  "2002:7f00:1::",
  "2001:db8::1",
  "64:ff9b::7f00:1",
  "not-an-address",
])("refuses non-public image addresses: %s", (address) => {
  expect(isPublicImageAddress(address)).toBe(false);
});

test.each(["93.184.215.14", "2606:4700:4700::1111"])(
  "accepts public addresses: %s",
  (address) => {
    expect(isPublicImageAddress(address)).toBe(true);
  },
);

test.each([
  "http://community.example/logo.png",
  "https://community.example:8443/logo.png",
  "https://user:secret@community.example/logo.png",
  "https://127.0.0.1/logo.png",
  "https://[::ffff:127.0.0.1]/logo.png",
  "/api/private",
])("rejects unsafe URLs before a request: %s", async (url) => {
  await expect(loadPublicRasterImage(url)).resolves.toBeNull();
  expect(get).not.toHaveBeenCalled();
});

test("rejects private DNS answers, including mixed public and private answers", async () => {
  for (const addresses of [
    [{ address: "127.0.0.1", family: 4 }],
    [
      { address: "93.184.215.14", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ],
  ]) {
    jest.mocked(lookup).mockResolvedValueOnce(addresses as never);
    await expect(
      loadPublicRasterImage("https://community.example/logo.png"),
    ).resolves.toBeNull();
  }
  expect(connected).not.toHaveBeenCalled();
});

test.each(["redirect", "SVG", "spoofed PNG", "declared size", "stream size"])(
  "rejects %s responses",
  async (kind) => {
    if (kind === "redirect") {
      status = 302;
      headers.location = "https://127.0.0.1/private";
    }
    if (kind === "SVG") headers["content-type"] = "image/svg+xml";
    if (kind === "spoofed PNG") body = Buffer.from("not a png");
    if (kind === "declared size")
      headers["content-length"] = String(6 * 1024 * 1024);
    if (kind === "stream size") body = Buffer.alloc(6 * 1024 * 1024);
    await expect(
      loadPublicRasterImage("https://community.example/logo.png"),
    ).resolves.toBeNull();
    expect(get).toHaveBeenCalledTimes(1);
  },
);
