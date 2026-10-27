import { prisma } from "infra/database";
import webserver from "infra/webserver";
import orchestrator from "tests/orchestrator";
import userModel from "models/user";
import {
  authenticatedJsonHeaders,
  createLifecycleActor,
  createReadyDraft,
  publicationRequest,
} from "tests/integration/api/v1/_support/outlet-lifecycle";
import type { AffiliateLink } from "contracts/outlet-affiliates";

beforeAll(async () => {
  await orchestrator.waitForAllServices();
});
beforeEach(async () => {
  await orchestrator.clearDatabaseRows();
});

const endpoint = (slug: string, query = "") =>
  `${webserver.getOrigin()}/api/v1/stores/${slug}/affiliate-links${query}`;
const gift = (merchant = "amazon") => ({
  kind: "gift_card",
  merchant,
  platform: "steam",
  country: "BR",
  url:
    merchant === "amazon"
      ? "https://amzn.to/synthetic?tag=synthetic-20"
      : "https://mercadolivre.com/sec/synthetic",
});
async function write(
  slug: string,
  token: string,
  expected: number,
  link: Record<string, unknown>,
  method = "POST",
) {
  return fetch(endpoint(slug), {
    method,
    headers: authenticatedJsonHeaders(token),
    body: JSON.stringify({ expected_draft_revision: expected, link }),
  });
}
async function draft(
  slug: string,
  token: string,
): Promise<{ links: AffiliateLink[]; draft_revision: number }> {
  const response = await fetch(endpoint(slug, "?draft=1"), {
    headers: authenticatedJsonHeaders(token),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  return response.json();
}

describe("Outlet affiliate link lifecycle", () => {
  test("publishes immutable links and independently resolves specific versus gift-card options", async () => {
    const fixture = await createReadyDraft("Affiliate lifecycle");
    const game = fixture.games[0];
    await prisma.game.update({
      where: { id: game.id },
      data: {
        social_links: { steam_page: "https://store.steampowered.com/app/400/" },
      },
    });
    let revision = fixture.store.draft_revision;
    expect(
      (
        await write(
          fixture.store.slug,
          fixture.sessionToken,
          revision++,
          gift(),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await write(
          fixture.store.slug,
          fixture.sessionToken,
          revision++,
          gift("mercado_livre"),
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await write(fixture.store.slug, fixture.sessionToken, revision++, {
          kind: "game",
          merchant: "nuuvem",
          platform: "steam",
          media_type: "digital",
          country: "BR",
          game_slug: game.slug,
          url: "https://www.nuuvem.com/br-pt/item/synthetic?ref=synthetic",
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await write(fixture.store.slug, fixture.sessionToken, revision++, {
          kind: "storefront",
          merchant: "amazon",
          url: "https://www.amazon.com.br/s?tag=synthetic-20",
        })
      ).status,
    ).toBe(201);
    const saved = await draft(fixture.store.slug, fixture.sessionToken);
    const specific = saved.links.find((link) => link.kind === "game")!;
    expect(saved.draft_revision).toBe(revision);
    expect((await fetch(endpoint(fixture.store.slug))).status).toBe(404);

    const preview = await fetch(
      endpoint(fixture.store.slug, `?preview=1&game_slug=${game.slug}`),
      { headers: authenticatedJsonHeaders(fixture.sessionToken) },
    );
    expect(preview.status).toBe(200);
    expect(preview.headers.get("cache-control")).toBe("private, no-store");
    const previewBody = await preview.json();
    expect(previewBody.published_revision_id).toBeNull();
    expect(
      previewBody.links.map((link: AffiliateLink) => link.merchant),
    ).toEqual(["nuuvem", "amazon", "mercado_livre"]);
    expect(
      (
        await publicationRequest(
          fixture.store.slug,
          fixture.sessionToken,
          "publish",
          revision,
        )
      ).status,
    ).toBe(200);
    const publicGeneral = await (
      await fetch(endpoint(fixture.store.slug))
    ).json();
    expect(publicGeneral.links).toHaveLength(1);
    expect(publicGeneral.links[0].kind).toBe("storefront");
    const firstRevisionId = publicGeneral.published_revision_id;
    const publicGame = await (
      await fetch(endpoint(fixture.store.slug, `?game_slug=${game.slug}`))
    ).json();
    expect(publicGame.links[0].id).toBe(specific.id);

    const removed = await fetch(endpoint(fixture.store.slug), {
      method: "DELETE",
      headers: authenticatedJsonHeaders(fixture.sessionToken),
      body: JSON.stringify({
        expected_draft_revision: revision,
        id: specific.id,
      }),
    });
    expect(removed.status).toBe(200);
    revision = (await removed.json()).draft_revision;
    expect(
      (
        await (
          await fetch(endpoint(fixture.store.slug, `?game_slug=${game.slug}`))
        ).json()
      ).links[0].id,
    ).toBe(specific.id);
    const updatedPreview = await (
      await fetch(
        endpoint(fixture.store.slug, `?preview=1&game_slug=${game.slug}`),
        { headers: authenticatedJsonHeaders(fixture.sessionToken) },
      )
    ).json();
    expect(updatedPreview.links[0].merchant).toBe("amazon");
    expect(
      (
        await publicationRequest(
          fixture.store.slug,
          fixture.sessionToken,
          "publish",
          revision,
        )
      ).status,
    ).toBe(200);
    const republished = await (
      await fetch(endpoint(fixture.store.slug, `?game_slug=${game.slug}`))
    ).json();
    expect(republished.links[0].merchant).toBe("amazon");
    expect(republished.published_revision_id).not.toBe(firstRevisionId);
    const oldSnapshot = await prisma.storeRevision.findUniqueOrThrow({
      where: { id: firstRevisionId },
    });
    expect(JSON.stringify(oldSnapshot.affiliate_links)).toContain(specific.id);
  });

  test("preserves IDs on edits and rolls back duplicate, malformed and stale writes", async () => {
    const fixture = await createReadyDraft("Affiliate editing");
    let revision = fixture.store.draft_revision;
    expect(
      (
        await write(
          fixture.store.slug,
          fixture.sessionToken,
          revision++,
          gift(),
        )
      ).status,
    ).toBe(201);
    const initial = await draft(fixture.store.slug, fixture.sessionToken);
    const id = initial.links[0].id;
    expect(
      (await write(fixture.store.slug, fixture.sessionToken, revision, gift()))
        .status,
    ).toBe(409);
    expect(
      (
        await write(fixture.store.slug, fixture.sessionToken, revision, {
          ...gift(),
          url: "https://amazon.com.br.attacker.example",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await write(
          fixture.store.slug,
          fixture.sessionToken,
          revision - 1,
          gift("mercado_livre"),
        )
      ).status,
    ).toBe(409);
    expect(
      (await draft(fixture.store.slug, fixture.sessionToken)).draft_revision,
    ).toBe(revision);
    const url = "https://www.amazon.com.br/item?tag=synthetic-20&value=%2F";
    expect(
      (
        await write(
          fixture.store.slug,
          fixture.sessionToken,
          revision++,
          { ...gift(), id, url },
          "PATCH",
        )
      ).status,
    ).toBe(200);
    const edited = await draft(fixture.store.slug, fixture.sessionToken);
    expect(edited.links[0]).toMatchObject({ id, url });
    expect(edited.draft_revision).toBe(revision);
  });

  test("enforces resource permissions and resolves concurrent draft writes once", async () => {
    const fixture = await createReadyDraft("Affiliate authorization");
    const outsider = await createLifecycleActor();
    const finance = await createLifecycleActor();
    await orchestrator.addStoreMember(fixture.store.id, finance.user.username, [
      "read:store_statement",
    ]);
    expect(
      (
        await write(
          fixture.store.slug,
          outsider.sessionToken,
          fixture.store.draft_revision,
          gift(),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(endpoint(fixture.store.slug, "?draft=1"), {
          headers: authenticatedJsonHeaders(finance.sessionToken),
        })
      ).status,
    ).toBe(403);
    const preview = await fetch(endpoint(fixture.store.slug, "?preview=1"));
    expect(preview.status).toBe(404);
    expect(preview.headers.get("cache-control")).toBe("private, no-store");
    const writes = await Promise.all([
      write(
        fixture.store.slug,
        fixture.sessionToken,
        fixture.store.draft_revision,
        gift(),
      ),
      write(
        fixture.store.slug,
        fixture.sessionToken,
        fixture.store.draft_revision,
        gift("mercado_livre"),
      ),
    ]);
    expect(writes.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const after = await draft(fixture.store.slug, fixture.sessionToken);
    expect(after.links).toHaveLength(1);
    expect(after.draft_revision).toBe(fixture.store.draft_revision + 1);
    await orchestrator.addStoreMember(
      fixture.store.id,
      outsider.user.username,
      ["update:store"],
    );
    expect(
      (
        await fetch(endpoint(fixture.store.slug, "?draft=1"), {
          headers: authenticatedJsonHeaders(outsider.sessionToken),
        })
      ).status,
    ).toBe(200);
    for (const actor of [fixture, outsider]) {
      await userModel.disable(actor.user.id);
      for (const query of ["?draft=1", "?preview=1"]) {
        const disabled = await fetch(endpoint(fixture.store.slug, query), {
          headers: authenticatedJsonHeaders(actor.sessionToken),
        });
        expect(disabled.status).toBe(403);
        expect(disabled.headers.get("cache-control")).toBe("private, no-store");
      }
    }
  });
});
