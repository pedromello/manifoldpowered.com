/** Creator-controlled local images must not invoke pages, APIs or proxies. */
export function isPublicStaticImage(url: URL): boolean {
  return (
    /^\/(images|storefronts)\//.test(url.pathname) &&
    !url.pathname.includes("%") &&
    !url.pathname.includes("\\") &&
    !url.search
  );
}

export function hasRasterSignature(
  bytes: Uint8Array,
  contentType: string,
): boolean {
  if (contentType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return [137, 80, 78, 71, 13, 10, 26, 10].every(
      (byte, index) => bytes[index] === byte,
    );
  }
  if (contentType === "image/gif") {
    const signature = String.fromCharCode(...bytes.subarray(0, 6));
    return signature === "GIF87a" || signature === "GIF89a";
  }
  if (contentType === "image/webp") {
    return (
      String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
    );
  }
  return false;
}
