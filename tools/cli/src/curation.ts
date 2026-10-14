import { ApiClient } from "./client";
import { CliError } from "./errors";

type ActionResult = { data: unknown; exitCode?: number; next_action?: unknown };
export async function completeOutletChange(
  slug: string,
  data: Record<string, unknown>,
  api: ApiClient,
): Promise<ActionResult> {
  // The mutation has already succeeded. A failed follow-up read must never
  // turn that accepted write into a retryable mutation failure.
  try {
    const publication = (await api.request(`/stores/${slug}/publication`)).body;
    return {
      data: {
        ...data,
        draft_revision: publication.draft_revision,
        readiness: publication.readiness,
      },
    };
  } catch {
    return {
      data: { ...data, mutation_outcome: "applied", readiness: null },
      next_action: { command: "outlets readiness", slug },
    };
  }
}
function query(payload: Record<string, unknown>) {
  return new URLSearchParams(
    Object.entries(payload)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  );
}
export async function curatorAction(
  name: string,
  payload: Record<string, unknown>,
  api: ApiClient,
  requestFetch: typeof fetch = fetch,
): Promise<ActionResult | undefined> {
  const { slug, game_slug: gameSlug, ...body } = payload;
  const storePath = `/stores/${slug}`;
  const changed = (data: Record<string, unknown>) =>
    completeOutletChange(String(slug), data, api);
  if (name === "outlets discover")
    return {
      data: (await api.request(`/public/stores?${query(payload)}`)).body,
    };
  if (name === "outlets public")
    return { data: (await api.request(storePath)).body };
  if (name === "outlets unpublish")
    return {
      data: (
        await api.request(`${storePath}/publication`, {
          method: "POST",
          body: { action: "unpublish", ...body },
        })
      ).body,
    };
  if (name.startsWith("outlets editorial ")) {
    const path = `${storePath}/game-editorials/${gameSlug}`;
    const method = name.endsWith("get")
      ? undefined
      : name.endsWith("set")
        ? "PUT"
        : "DELETE";
    return {
      data: (
        await api.request(method ? path : `${path}?preview=1`, {
          method,
          body: method ? body : undefined,
        })
      ).body,
    };
  }
  if (name === "outlets catalog list")
    return {
      data: (await api.request(`${storePath}/curation-catalog?${query(body)}`))
        .body,
    };
  if (
    [
      "outlets catalog add",
      "outlets catalog remove",
      "outlets catalog reset",
    ].includes(name)
  ) {
    const path = `${storePath}/game-overrides`;
    if (name.endsWith("reset"))
      return changed(
        (await api.request(`${path}/${gameSlug}`, { method: "DELETE", body }))
          .body,
      );
    const overrides = (await api.request(path, { arrayResponse: true })).body
      .items as Array<{ game_slug: string }>;
    const exists = overrides.some((item) => item.game_slug === gameSlug);
    return changed(
      (
        await api.request(exists ? `${path}/${gameSlug}` : path, {
          method: exists ? "PATCH" : "POST",
          body: {
            ...body,
            ...(!exists ? { game_slug: gameSlug } : {}),
            visibility: name.endsWith("add") ? "SHOW" : "HIDE",
          },
        })
      ).body,
    );
  }
  if (
    name === "outlets catalog bulk preview" ||
    name === "outlets catalog bulk apply"
  ) {
    return {
      data: (
        await api.request(
          `${storePath}/game-overrides/bulk${name.endsWith("preview") ? "/preview" : ""}`,
          { method: "POST", body },
        )
      ).body,
    };
  }
  if (name.startsWith("outlets tags ")) {
    const path = `${storePath}/tag-filters`;
    if (name.endsWith("list"))
      return {
        data: {
          tag_filters: (await api.request(path, { arrayResponse: true })).body
            .items,
        },
      };
    if (name.endsWith("preview"))
      return {
        data: (await api.request(`${path}/preview`, { method: "POST", body }))
          .body,
      };
    const { tag, ...rest } = body;
    const method = name.endsWith("add")
      ? "POST"
      : name.endsWith("update")
        ? "PATCH"
        : "DELETE";
    return changed(
      (
        await api.request(
          method === "POST"
            ? path
            : `${path}/${encodeURIComponent(String(tag))}`,
          { method, body: method === "POST" ? body : rest },
        )
      ).body,
    );
  }
  if (name.startsWith("reviews ")) {
    if (name.endsWith("list"))
      return { data: (await api.request(`/reviews?${query(payload)}`)).body };
    const method = name.endsWith("create")
      ? "POST"
      : name.endsWith("update")
        ? "PATCH"
        : "DELETE";
    if (method !== "DELETE") {
      const eligibility = (
        await api.request(`/reviews?${query({ slug, limit: 1 })}`)
      ).body;
      if (!eligibility.can_review)
        throw new CliError(
          "REVIEW_NOT_ALLOWED",
          "A conta não é elegível para avaliar este jogo. Consulte reviews list.",
        );
    }
    const response = await api.request("/reviews", { method, body: payload });
    return { data: { ...response.body, slug } };
  }
  if (name.startsWith("library "))
    return {
      data: (
        await api.request(
          `/library?${query(name.endsWith("has") ? { slug, limit: 1 } : payload)}`,
        )
      ).body,
    };
  if (name.startsWith("wishlist ")) {
    const method = name.endsWith("status")
      ? undefined
      : name.endsWith("add")
        ? "POST"
        : "DELETE";
    return {
      data: {
        ...(
          await api.request(
            method ? "/wishlists" : `/wishlists?${query(payload)}`,
            { method, body: method ? payload : undefined },
          )
        ).body,
        slug,
      },
    };
  }
  if (
    ["outlets follow", "outlets unfollow", "outlets followed"].includes(name)
  ) {
    return {
      data: (
        await api.request(
          "/store-follows",
          name === "outlets followed"
            ? {}
            : {
                method: name === "outlets follow" ? "POST" : "DELETE",
                body: { store_slug: slug },
              },
        )
      ).body,
    };
  }
  if (name === "outlets verify")
    return verifyOutlet(
      String(slug),
      api,
      !!payload.check_images,
      requestFetch,
    );
}
async function verifyOutlet(
  slug: string,
  api: ApiClient,
  checkImages: boolean,
  requestFetch: typeof fetch,
): Promise<ActionResult> {
  const path = `/stores/${slug}`;
  const draft = (await api.request(`${path}?preview=1`)).body;
  const publication = (await api.request(`${path}/publication`)).body;
  const issues: Array<{
    severity: "error" | "warning";
    code: string;
    field?: string;
    game_slug?: string;
  }> = [];
  const readiness = publication.readiness as {
    ready: boolean;
    blockers: Array<{ code: string }>;
    catalog_game_count: number;
  };
  for (const blocker of readiness.blockers)
    issues.push({ severity: "error", code: blocker.code });
  const published = publication.published_revision as {
    source_draft_revision?: number;
  } | null;
  if (
    published &&
    published.source_draft_revision !== publication.draft_revision
  )
    issues.push({ severity: "warning", code: "UNPUBLISHED_DRAFT_CHANGES" });
  const games: Array<{ slug: string }> = [];
  let page = 1,
    pages = 1;
  do {
    const catalog = (
      await api.request(
        `${path}/curation-catalog?status=IN_OUTLET&limit=48&page=${page}`,
      )
    ).body;
    games.push(...(catalog.games as Array<{ slug: string }>));
    pages = Number((catalog.pagination as { pages?: number }).pages ?? 1);
    page++;
    if (page > 1000 && page <= pages)
      throw new CliError(
        "CATALOG_TOO_LARGE",
        "Divida a verificação de catálogos com mais de 48.000 jogos.",
      );
  } while (page <= pages);
  const textGroups = new Map<string, string[]>();
  let editorialCount = 0;
  for (const game of games) {
    const editorial = (
      await api.request(`${path}/game-editorials/${game.slug}?preview=1`)
    ).body.review as { body?: string } | null;
    if (editorial?.body) {
      editorialCount++;
      const normalized = editorial.body
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
      const entries = textGroups.get(normalized) ?? [];
      entries.push(game.slug);
      textGroups.set(normalized, entries);
    }
  }
  for (const entries of textGroups.values())
    if (entries.length > 1)
      entries.forEach((game_slug) =>
        issues.push({
          severity: "warning",
          code: "DUPLICATE_EDITORIAL_TEXT",
          game_slug,
        }),
      );
  const images: Array<{ field: string; state: string; http_status?: number }> =
    [];
  for (const field of ["logo_url", "cover_url"]) {
    const value = draft[field];
    if (typeof value !== "string" || !value) continue;
    if (!checkImages) {
      images.push({ field, state: "not_checked" });
      continue;
    }
    let valid = false,
      status: number | undefined;
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        host === "localhost" ||
        host.endsWith(".local") ||
        /^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|\[)/.test(
          host,
        )
      )
        throw new Error("Private image origin");
      const response = await requestFetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
        headers: { Range: "bytes=0-0", Accept: "image/*" },
      });
      status = response.status;
      valid =
        response.ok &&
        (response.headers.get("content-type") ?? "").startsWith("image/");
      await response.body?.cancel();
    } catch {
      /* The report does not expose URL credentials or network errors. */
    }
    images.push({
      field,
      state: valid ? "available" : "unavailable",
      http_status: status,
    });
    if (!valid)
      issues.push({ severity: "error", code: "IMAGE_UNAVAILABLE", field });
  }
  const errors = issues.filter((issue) => issue.severity === "error").length;
  return {
    exitCode: errors ? 1 : 0,
    data: {
      slug,
      status: errors ? "issues" : issues.length ? "warnings" : "pass",
      publication_status: publication.status,
      draft_revision: publication.draft_revision,
      published_revision: publication.published_revision,
      readiness,
      stats: { catalog_games: games.length, editorials: editorialCount },
      images,
      issues,
      preview_url: `${api.origin}/store/${slug}?preview=1`,
      public_url: published ? `${api.origin}/store/${slug}` : null,
    },
  };
}
