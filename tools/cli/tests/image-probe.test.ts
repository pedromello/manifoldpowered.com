import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage } from "node:http";
import type { request, RequestOptions } from "node:https";
import { probeImage } from "../src/image-probe";

function transport(
  inspect: (url: URL, options: RequestOptions) => void,
  status = 206,
  contentType = "image/png",
): typeof request {
  return ((
    url: URL,
    options: RequestOptions,
    callback: (response: IncomingMessage) => void,
  ) => {
    inspect(url, options);
    const req = new EventEmitter() as ClientRequest;
    req.destroy = () => req;
    req.end = (() => {
      queueMicrotask(() =>
        callback({
          statusCode: status,
          headers: {
            "content-type": contentType,
            location: "https://127.0.0.1/private",
          },
          destroy() {},
        } as IncomingMessage),
      );
      return req;
    }) as ClientRequest["end"];
    return req;
  }) as typeof request;
}

test("image verification blocks every private or special DNS destination before connecting", async () => {
  let connections = 0;
  const request = transport(() => {
    connections++;
  });
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "0.0.0.0",
    "100.64.0.1",
    "198.18.0.1",
    "192.0.2.1",
    "224.0.0.1",
    "::1",
    "::",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "64:ff9b::a00:1",
    "2001:db8::1",
    "2002:7f00:1::1",
    "3fff::1",
  ]) {
    const outcome = await probeImage("https://assets.example/logo", {
      lookup: async () => [{ address, family: address.includes(":") ? 6 : 4 }],
      request,
    });
    assert.equal(outcome.state, "unavailable", address);
  }
  assert.equal(
    (
      await probeImage("https://assets.example/logo", {
        lookup: async () => [
          { address: "8.8.8.8", family: 4 },
          { address: "10.0.0.1", family: 4 },
        ],
        request,
      })
    ).state,
    "unavailable",
  );
  for (const url of [
    "http://assets.example/logo",
    "https://user:secret@assets.example/logo",
    "https://127.1/logo",
    "https://[::1]/logo",
    "https://localhost/logo",
  ]) {
    assert.equal((await probeImage(url, { request })).state, "unavailable");
  }
  assert.equal(connections, 0);
});

test("image connections pin the checked DNS address and preserve TLS hostname without credentials", async () => {
  for (const address of ["8.8.8.8", "2606:4700:4700::1111"]) {
    let resolutions = 0;
    let connections = 0;
    const family = address.includes(":") ? 6 : 4;
    const outcome = await probeImage("https://rebind.example/logo.png", {
      lookup: async () => [
        { address: ++resolutions === 1 ? address : "10.0.0.1", family },
      ],
      request: transport((url, options) => {
        connections++;
        assert.equal(url.hostname, "rebind.example");
        assert.equal(options.agent, false);
        assert.equal(options.rejectUnauthorized, undefined);
        assert.deepEqual(options.headers, {
          Range: "bytes=0-0",
          Accept: "image/*",
        });
        assert.ok(options.signal);
        options.lookup!("rebind.example", { all: true }, (error, result) => {
          assert.equal(error, null);
          assert.deepEqual(result, [{ address, family }]);
        });
        options.lookup!("rebind.example", {}, (error, result, actualFamily) => {
          assert.equal(error, null);
          assert.equal(result, address);
          assert.equal(actualFamily, family);
        });
      }),
    });
    assert.deepEqual(outcome, { state: "available", http_status: 206 });
    assert.equal(resolutions, 1);
    assert.equal(connections, 1);
  }
});

test("image redirects and non-image responses are unavailable and never followed", async () => {
  for (const [status, type] of [
    [302, "image/png"],
    [200, "application/json"],
    [404, "image/png"],
  ] as const) {
    let requests = 0;
    const result = await probeImage("https://assets.example/logo", {
      lookup: async () => [{ address: "8.8.8.8", family: 4 }],
      request: transport(
        () => {
          requests++;
        },
        status,
        type,
      ),
    });
    assert.deepEqual(result, { state: "unavailable", http_status: status });
    assert.equal(requests, 1);
  }
  assert.deepEqual(
    await probeImage("https://assets.example/logo", {
      lookup: async () => {
        throw new Error("Private diagnostic that must not escape");
      },
    }),
    { state: "unavailable" },
  );
});
