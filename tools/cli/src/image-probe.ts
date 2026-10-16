import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { request } from "node:https";
import { isIP } from "node:net";

type Destination = LookupAddress;
export type ImageProbeDependencies = {
  lookup?: (hostname: string) => Promise<Destination[]>;
  request?: typeof request;
};
export type ImageProbeResult = {
  state: "available" | "unavailable";
  http_status?: number;
};

function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 &&
        (b === 168 ||
          (b === 0 && (c === 0 || c === 2)) ||
          (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (isIP(address) !== 6) return false;
  const normalized = new URL(`https://[${address}]`).hostname.slice(1, -1);
  const [a, b] = normalized
    .split(":")
    .map((value) => parseInt(value || "0", 16));
  // Global unicast only; exclude special-purpose, documentation and 6to4 ranges.
  return (
    a >= 0x2000 &&
    a <= 0x3fff &&
    a !== 0x2002 &&
    !(a === 0x2001 && (b <= 0x1ff || b === 0xdb8)) &&
    !(a === 0x3fff && b <= 0xfff)
  );
}

export async function probeImage(
  value: string,
  dependencies: ImageProbeDependencies = {},
): Promise<ImageProbeResult> {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local")
    )
      return { state: "unavailable" };
    const signal = AbortSignal.timeout(10000);
    const resolve =
      dependencies.lookup ?? ((hostname) => lookup(hostname, { all: true }));
    const resolution = isIP(host)
      ? Promise.resolve([{ address: host, family: isIP(host) }])
      : resolve(host);
    const addresses = await new Promise<Destination[]>((accept, reject) => {
      const abort = () => reject(new Error("Image lookup timed out"));
      signal.addEventListener("abort", abort, { once: true });
      resolution.then(
        (values) => {
          signal.removeEventListener("abort", abort);
          accept(values);
        },
        (error) => {
          signal.removeEventListener("abort", abort);
          reject(error);
        },
      );
    });
    if (
      !addresses.length ||
      addresses.some((entry) => !publicAddress(entry.address))
    )
      return { state: "unavailable" };
    const destination = addresses[0];
    return await new Promise<ImageProbeResult>((accept, reject) => {
      const req = (dependencies.request ?? request)(
        url,
        {
          method: "GET",
          agent: false,
          signal,
          family: destination.family,
          headers: { Range: "bytes=0-0", Accept: "image/*" },
          // Pin the checked address; TLS still verifies the original URL hostname.
          lookup: (_hostname, options, callback) => {
            if (options.all) callback(null, [destination]);
            else callback(null, destination.address, destination.family);
          },
        },
        (response) => {
          const status = response.statusCode ?? 0;
          const image =
            status >= 200 &&
            status < 300 &&
            String(response.headers["content-type"] ?? "")
              .toLowerCase()
              .startsWith("image/");
          accept({
            state: image ? "available" : "unavailable",
            http_status: status,
          });
          response.destroy();
          req.destroy();
        },
      );
      req.on("error", reject);
      req.end();
    });
  } catch {
    // Do not expose untrusted URLs, credentials, DNS responses or TLS errors.
    return { state: "unavailable" };
  }
}
