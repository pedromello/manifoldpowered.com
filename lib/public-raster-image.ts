import { lookup } from "node:dns/promises";
import { get, type RequestOptions } from "node:https";
import { BlockList, isIP, type TcpNetConnectOpts } from "node:net";
import { hasRasterSignature } from "lib/raster-image";

const MAX_BYTES = 5 * 1024 * 1024;
const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(address, prefix, "ipv4");
blocked.addSubnet("2001::", 23, "ipv6");
blocked.addSubnet("2001:db8::", 32, "ipv6");
blocked.addSubnet("2002::", 16, "ipv6");
blocked.addSubnet("3fff::", 20, "ipv6");
const globalIPv6 = new BlockList();
globalIPv6.addSubnet("2000::", 3, "ipv6");

export function isPublicImageAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  return (
    family === 6 &&
    globalIPv6.check(address, "ipv6") &&
    !blocked.check(address, "ipv6")
  );
}

export type PublicRasterImage = { bytes: Buffer; contentType: string };

/** No domain allow-list: validate DNS and pin the checked address to the socket. */
export async function loadPublicRasterImage(
  candidate: string,
): Promise<PublicRasterImage | null> {
  try {
    const url = new URL(candidate);
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443") ||
      (isIP(hostname) && !isPublicImageAddress(hostname))
    )
      return null;

    return await new Promise((resolve) => {
      const connectionOptions: RequestOptions &
        Pick<TcpNetConnectOpts, "autoSelectFamily"> = {
        signal: AbortSignal.timeout(2500),
        agent: false,
        autoSelectFamily: false,
        lookup: (host, _options, callback) => {
          lookup(host, { all: true }).then(
            (addresses) => {
              if (
                !addresses.length ||
                addresses.some(({ address }) => !isPublicImageAddress(address))
              ) {
                callback(new Error("Non-public image address"), "", 0);
                return;
              }
              const { address, family } =
                addresses.find(({ family }) => family === 4) ?? addresses[0];
              callback(null, address, family);
            },
            (error) => callback(error, "", 0),
          );
        },
      };
      const request = get(url, connectionOptions, (response) => {
        const contentType =
          response.headers["content-type"]
            ?.split(";")[0]
            .trim()
            .toLowerCase() ?? "";
        const length = Number(response.headers["content-length"] ?? 0);
        // Redirects are deliberately not followed, so they cannot bypass DNS checks.
        if (
          response.statusCode !== 200 ||
          !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(
            contentType,
          ) ||
          !Number.isSafeInteger(length) ||
          length < 0 ||
          length > MAX_BYTES
        ) {
          response.destroy();
          resolve(null);
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            response.destroy();
            resolve(null);
          } else chunks.push(chunk);
        });
        response.on("error", () => resolve(null));
        response.on("end", () => {
          const bytes = Buffer.concat(chunks);
          resolve(
            hasRasterSignature(bytes, contentType)
              ? { bytes, contentType }
              : null,
          );
        });
      });
      request.on("error", () => resolve(null));
    });
  } catch {
    return null;
  }
}
