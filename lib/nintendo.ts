export type NintendoCountry = "BR" | "US";

/** Accept product pages only. Never fetch arbitrary user-provided hosts. */
export function parseNintendoUrl(input: string) {
  try {
    const url = new URL(input.trim());
    const match =
      /^\/(pt-br|us)\/store\/products\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/.exec(
        url.pathname,
      );
    if (
      url.protocol !== "https:" ||
      url.hostname !== "www.nintendo.com" ||
      url.port ||
      url.username ||
      url.password ||
      !match
    )
      return null;
    const country: NintendoCountry = match[1] === "pt-br" ? "BR" : "US";
    return {
      country,
      slug: match[2],
      url: nintendoProductUrl(match[2], country),
    };
  } catch {
    return null;
  }
}

export function nintendoProductUrl(slug: string, country: NintendoCountry) {
  return `https://www.nintendo.com/${country === "BR" ? "pt-br" : "us"}/store/products/${slug}/`;
}

export function isNintendoImage(url: string) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "assets.nintendo.com" &&
      !parsed.port &&
      !parsed.username &&
      !parsed.password &&
      parsed.pathname.startsWith("/image/upload/")
    );
  } catch {
    return false;
  }
}
