import { managementShellOutput } from "models/store_management_shell";

describe("managementShellOutput", () => {
  test("allowlists the shell and never serializes mutable draft fields", () => {
    const capabilities = {
      identity: false,
      curation: false,
      featured: false,
      sales: false,
      earnings: true,
      edit: false,
      publish: false,
      unpublish: false,
    };
    const shell = managementShellOutput(
      {
        id: "store-1",
        slug: "save-point",
        name: "Save Point",
        owner_id: "owner-1",
        status: "DRAFT",
        published_at: null,
        members: [],
        description: "secret draft copy",
        logo_url: "https://cdn.example.test/secret.png",
        catalog_mode: "SELECTED",
        draft_revision: 42,
        published_revision_id: null,
        last_published_revision_id: null,
        last_published_at: null,
        commission_rate: null,
        created_at: new Date("2026-09-01T00:00:00.000Z"),
        updated_at: new Date("2026-09-01T00:00:00.000Z"),
      },
      capabilities,
    );

    expect(shell).toEqual({
      store: {
        id: "store-1",
        slug: "save-point",
        name: "Save Point",
        owner_id: "owner-1",
        status: "DRAFT",
        published_at: null,
      },
      capabilities,
    });
    expect(JSON.stringify(shell)).not.toMatch(
      /description|logo_url|catalog_mode|draft_revision|readiness|presentation|snapshot/,
    );
  });
});
