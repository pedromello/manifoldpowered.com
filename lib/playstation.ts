export type PlayStationCountry = "BR" | "US";
export const PLAYSTATION_PRODUCT_ID =
  /^[A-Z]{2}\d{4}-[A-Z0-9]{9}_\d{2}-[A-Z0-9]{16}$/;

/** Import an exact edition. Concept/gamehub URLs can contain several editions. */
export function parsePlayStationUrl(input: string) {
  try {
    const url = new URL(input.trim());
    const match = /^\/(pt-br|en-us)\/product\/([^/]+)\/?$/.exec(url.pathname);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "store.playstation.com" ||
      url.port ||
      url.username ||
      url.password ||
      !match ||
      !PLAYSTATION_PRODUCT_ID.test(match[2])
    )
      return null;
    const country: PlayStationCountry = match[1] === "pt-br" ? "BR" : "US";
    return {
      productId: match[2],
      country,
      url: playStationProductUrl(match[2], country),
    };
  } catch {
    return null;
  }
}

export function playStationProductUrl(
  productId: string,
  country: PlayStationCountry,
) {
  return `https://store.playstation.com/${country === "BR" ? "pt-br" : "en-us"}/product/${productId}`;
}

export function isPlayStationImage(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "image.api.playstation.com" &&
      !url.port &&
      !url.username &&
      !url.password &&
      url.pathname.startsWith("/vulcan/")
    );
  } catch {
    return false;
  }
}

export function isPlayStationVideo(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "vulcan.dl.playstation.net" &&
      !url.port &&
      !url.username &&
      !url.password &&
      url.pathname.startsWith("/img/") &&
      url.pathname.endsWith(".mp4")
    );
  } catch {
    return false;
  }
}
