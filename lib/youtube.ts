const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const URL_CANDIDATE = /https?:\/\/[^\s<>]+/gi;

function normalizedCandidate(candidate: string) {
  return candidate.replace(/[),.!?;:'"]+$/g, "");
}

export function youtubeVideoId(value: string): string | null {
  try {
    const url = new URL(normalizedCandidate(value));
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let candidate: string | null = null;

    if (host === "youtu.be") {
      candidate = url.pathname.split("/").filter(Boolean)[0] ?? null;
    } else if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") {
        candidate = url.searchParams.get("v");
      } else {
        const [kind, id] = url.pathname.split("/").filter(Boolean);
        if (["embed", "shorts", "live"].includes(kind)) candidate = id ?? null;
      }
    }

    return candidate && YOUTUBE_ID.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function youtubeEmbedsFromText(text: string) {
  const seen = new Set<string>();
  const embeds: Array<{ id: string; url: string }> = [];

  for (const match of text.matchAll(URL_CANDIDATE)) {
    const url = normalizedCandidate(match[0]);
    const id = youtubeVideoId(url);
    if (id && !seen.has(id)) {
      seen.add(id);
      embeds.push({ id, url });
    }
  }

  return embeds;
}

export function reviewTextParts(text: string) {
  const parts: Array<{ kind: "text" | "link"; value: string }> = [];
  let cursor = 0;

  for (const match of text.matchAll(URL_CANDIDATE)) {
    const index = match.index ?? cursor;
    if (index > cursor) {
      parts.push({ kind: "text", value: text.slice(cursor, index) });
    }
    const normalized = normalizedCandidate(match[0]);
    parts.push({ kind: "link", value: normalized });
    const trailing = match[0].slice(normalized.length);
    if (trailing) parts.push({ kind: "text", value: trailing });
    cursor = index + match[0].length;
  }

  if (cursor < text.length) {
    parts.push({ kind: "text", value: text.slice(cursor) });
  }
  return parts;
}
