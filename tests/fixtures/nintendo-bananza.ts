import { nintendoHtml } from "./nintendo";
import type { NintendoCountry } from "lib/nintendo";

// Reduced BR product/gallery captured from Nintendo on 2026-09-12 UTC.
// Source: https://www.nintendo.com/pt-br/store/products/donkey-kong-bananza-switch-2/
// Tests use this fixed public payload; they do not require a live Nintendo request.
const product = {
  nsuid: "70010000096809",
  name: "Donkey Kong™ Bananza",
  urlKey: "donkey-kong-bananza-switch-2",
  platform: {
    __typename: "Platform",
    label: "Nintendo Switch 2",
    code: "NINTENDO_SWITCH_2",
  },
  productImage: {
    publicId:
      "store/software/switch2/70010000096809/c103f1be80b02409d0ebd7b1411bad3f7a5d7cadea6974af2158fbf04e0a3410",
    resourceType: "image",
    url: "https://assets.nintendo.com/image/upload/q_auto/f_auto/store/software/switch2/70010000096809/c103f1be80b02409d0ebd7b1411bad3f7a5d7cadea6974af2158fbf04e0a3410",
  },
  productGallery: [
    {
      publicId:
        "/store/software/switch2/70010000096809/Video/216b4fb1cd8aa19fb1383db58f2ad7a09ca16d091c58e844c26371b0c5e9103e",
      resourceType: "video",
    },
    {
      publicId:
        "/store/software/switch2/70010000096809/Video/74a5f217ee998c562c8080cb61741bd2d21a3787e3ff6820686ec36687b724d3",
      resourceType: "video",
    },
    {
      publicId:
        "store/software/switch2/70010000096809/c111819ae2b07f446ab92d64c8d37e9ef8e541e30b687121fa6d5976096b61f9",
      resourceType: "image",
    },
    {
      publicId:
        "store/software/switch2/70010000096809/b8ae4b278d62fb9683adf9939c79a3fc5ac71a671d1d644eb8774c4904e34ee2",
      resourceType: "image",
    },
    {
      publicId:
        "store/software/switch2/70010000096809/1db3e042985d95332cb7750d9353a343b33415b12fbb82be6bffbcf0848949c3",
      resourceType: "image",
    },
    {
      publicId:
        "store/software/switch2/70010000096809/eedd5cf569384e972df7ee8cebb8a84ec86a7ab7f382f3f34b40e2cc4d22b8e1",
      resourceType: "image",
    },
    {
      publicId:
        "store/software/switch2/70010000096809/760dd462413e23f48dd733041689430bf6446b9f88494c4edee7a44fd86ebabf",
      resourceType: "image",
    },
    {
      publicId:
        "store/software/switch2/70010000096809/2b26c97324f4f252bfafeb75737a50629f53a9b101594fa6ad8d207876053b77",
      resourceType: "image",
    },
  ],
};

export function bananzaHtml(country: NintendoCountry = "BR") {
  return nintendoHtml(country, product);
}

export const bananzaExpectedMedia = {
  banner:
    "https://assets.nintendo.com/image/upload/q_auto/f_auto/store/software/switch2/70010000096809/c103f1be80b02409d0ebd7b1411bad3f7a5d7cadea6974af2158fbf04e0a3410",
  icon: "https://assets.nintendo.com/image/upload/q_auto/f_auto/store/software/switch2/70010000096809/c103f1be80b02409d0ebd7b1411bad3f7a5d7cadea6974af2158fbf04e0a3410",
  screenshots: [
    "https://assets.nintendo.com/image/upload/q_auto/f_auto/store/software/switch2/70010000096809/c111819ae2b07f446ab92d64c8d37e9ef8e541e30b687121fa6d5976096b61f9",
    "https://assets.nintendo.com/image/upload/q_auto/f_auto/store/software/switch2/70010000096809/b8ae4b278d62fb9683adf9939c79a3fc5ac71a671d1d644eb8774c4904e34ee2",
    "https://assets.nintendo.com/image/upload/q_auto/f_auto/store/software/switch2/70010000096809/1db3e042985d95332cb7750d9353a343b33415b12fbb82be6bffbcf0848949c3",
    "https://assets.nintendo.com/image/upload/q_auto/f_auto/store/software/switch2/70010000096809/eedd5cf569384e972df7ee8cebb8a84ec86a7ab7f382f3f34b40e2cc4d22b8e1",
    "https://assets.nintendo.com/image/upload/q_auto/f_auto/store/software/switch2/70010000096809/760dd462413e23f48dd733041689430bf6446b9f88494c4edee7a44fd86ebabf",
    "https://assets.nintendo.com/image/upload/q_auto/f_auto/store/software/switch2/70010000096809/2b26c97324f4f252bfafeb75737a50629f53a9b101594fa6ad8d207876053b77",
  ],
  videos: [
    "https://assets.nintendo.com/video/upload/store/software/switch2/70010000096809/Video/216b4fb1cd8aa19fb1383db58f2ad7a09ca16d091c58e844c26371b0c5e9103e.mp4",
    "https://assets.nintendo.com/video/upload/store/software/switch2/70010000096809/Video/74a5f217ee998c562c8080cb61741bd2d21a3787e3ff6820686ec36687b724d3.mp4",
  ],
};
