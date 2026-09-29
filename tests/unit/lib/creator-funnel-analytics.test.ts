import {
  CREATOR_OUTLET_FUNNEL_VERSION,
  CREATOR_OUTLET_PUBLISH_READINESS_VERSION,
  createCreatorFunnelAnalytics,
} from "lib/creator-funnel-analytics";

describe("creator funnel analytics", () => {
  test("emits the seven funnel events with flat allow-listed payloads", () => {
    expect(CREATOR_OUTLET_PUBLISH_READINESS_VERSION).toBe(2);

    const transport = jest.fn();
    const analytics = createCreatorFunnelAnalytics(transport);

    analytics.createStarted({
      funnelVersion: CREATOR_OUTLET_FUNNEL_VERSION,
      entrySurface: "creator_workspace",
    });
    analytics.draftCreated({
      funnelVersion: CREATOR_OUTLET_FUNNEL_VERSION,
      entrySurface: "create_outlet",
      hasDescription: true,
      hasLogo: false,
    });
    analytics.firstGameAdded({
      funnelVersion: CREATOR_OUTLET_FUNNEL_VERSION,
      entrySurface: "manage_outlet",
      selectionSurface: "featured",
    });
    analytics.brandComplete({
      funnelVersion: CREATOR_OUTLET_FUNNEL_VERSION,
      entrySurface: "manage_outlet",
    });
    analytics.previewed({
      funnelVersion: CREATOR_OUTLET_FUNNEL_VERSION,
      entrySurface: "outlet_preview",
      outletState: "draft",
    });
    analytics.published({
      funnelVersion: CREATOR_OUTLET_FUNNEL_VERSION,
      entrySurface: "manage_outlet",
    });
    analytics.linkCopied({
      funnelVersion: CREATOR_OUTLET_FUNNEL_VERSION,
      entrySurface: "manage_outlet",
      copyContext: "publish_success",
    });

    expect(transport.mock.calls).toEqual([
      [
        "creator_outlet_create_started",
        { funnel_version: 1, entry_surface: "creator_workspace" },
      ],
      [
        "creator_outlet_draft_created",
        {
          funnel_version: 1,
          entry_surface: "create_outlet",
          has_description: true,
          has_logo: false,
        },
      ],
      [
        "creator_outlet_first_game_added",
        {
          funnel_version: 1,
          entry_surface: "manage_outlet",
          selection_surface: "featured",
        },
      ],
      [
        "creator_outlet_brand_complete",
        {
          funnel_version: 1,
          entry_surface: "manage_outlet",
          criteria_version: 1,
        },
      ],
      [
        "creator_outlet_previewed",
        {
          funnel_version: 1,
          entry_surface: "outlet_preview",
          outlet_state: "draft",
        },
      ],
      [
        "creator_outlet_published",
        {
          funnel_version: 1,
          entry_surface: "manage_outlet",
          readiness_version: 2,
        },
      ],
      [
        "creator_outlet_link_copied",
        {
          funnel_version: 1,
          entry_surface: "manage_outlet",
          copy_context: "publish_success",
        },
      ],
    ]);

    for (const [, properties] of transport.mock.calls) {
      expect(properties).toEqual(
        expect.objectContaining({
          funnel_version: 1,
          entry_surface: expect.stringMatching(
            /^(creator_workspace|create_outlet|manage_outlet|outlet_preview)$/,
          ),
        }),
      );
      for (const value of Object.values(properties)) {
        expect(
          value === null ||
            ["string", "number", "boolean"].includes(typeof value),
        ).toBe(true);
      }
    }
  });

  test("reconstructs payloads instead of forwarding unexpected caller data", () => {
    const transport = jest.fn();
    const analytics = createCreatorFunnelAnalytics(transport);
    const callerOwnedInput = {
      funnelVersion: CREATOR_OUTLET_FUNNEL_VERSION,
      entrySurface: "create_outlet" as const,
      hasDescription: true,
      hasLogo: true,
      outletSlug: "private-outlet",
      ownerEmail: "creator@example.test",
      logoUrl: "https://example.test/private.png",
    };

    analytics.draftCreated(callerOwnedInput);

    expect(transport).toHaveBeenCalledWith("creator_outlet_draft_created", {
      funnel_version: 1,
      entry_surface: "create_outlet",
      has_description: true,
      has_logo: true,
    });
  });

  test("rejects runtime context values outside the closed allow-lists", () => {
    const transport = jest.fn();
    const analytics = createCreatorFunnelAnalytics(transport);

    analytics.createStarted({
      funnelVersion: 99,
      entrySurface: "creator@example.test",
    } as unknown as Parameters<typeof analytics.createStarted>[0]);
    analytics.firstGameAdded({
      funnelVersion: CREATOR_OUTLET_FUNNEL_VERSION,
      entrySurface: "manage_outlet",
      selectionSurface: "private-game-slug",
    } as unknown as Parameters<typeof analytics.firstGameAdded>[0]);

    expect(transport).not.toHaveBeenCalled();
  });

  test("does not let a transport failure block the creator flow", () => {
    const analytics = createCreatorFunnelAnalytics(() => {
      throw new Error("analytics unavailable");
    });

    expect(() =>
      analytics.published({
        funnelVersion: CREATOR_OUTLET_FUNNEL_VERSION,
        entrySurface: "manage_outlet",
      }),
    ).not.toThrow();
  });
});
