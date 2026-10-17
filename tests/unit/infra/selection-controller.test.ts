import type { NextApiRequest } from "next";
import { authorizeSelection } from "infra/selection-controller";
import store from "models/store";

jest.mock("models/store", () => ({
  __esModule: true,
  default: { findOneBySlugWithMembers: jest.fn() },
}));
const outlet = {
  id: "outlet-id",
  slug: "cozy",
  owner_id: "owner",
  members: [{ user_id: "editor", permissions: ["update:store"] }],
};
const request = (id: string, features = ["update:store", "publish:store"]) =>
  ({
    query: { slug: "cozy" },
    context: { user: { id, features } },
  }) as unknown as NextApiRequest;
beforeEach(() =>
  jest
    .mocked(store.findOneBySlugWithMembers)
    .mockResolvedValue(outlet as never),
);

test("the owner can edit and publish their selections", async () => {
  await expect(authorizeSelection(request("owner"), "write")).resolves.toEqual(
    outlet,
  );
  await expect(
    authorizeSelection(request("owner"), "publish"),
  ).resolves.toEqual(outlet);
});
test("an editor can inspect/edit but cannot publish without delegated publication permission", async () => {
  await expect(authorizeSelection(request("editor"), "read")).resolves.toEqual(
    outlet,
  );
  await expect(authorizeSelection(request("editor"), "write")).resolves.toEqual(
    outlet,
  );
  await expect(
    authorizeSelection(request("editor"), "publish"),
  ).rejects.toMatchObject({ name: "ForbiddenError" });
});
test("global outlet features do not give another account access to this outlet", async () => {
  await expect(
    authorizeSelection(request("other"), "read"),
  ).rejects.toMatchObject({ name: "ForbiddenError" });
  await expect(
    authorizeSelection(request("other"), "write"),
  ).rejects.toMatchObject({ name: "ForbiddenError" });
});
test("a disabled owner or financial-only delegate cannot access selection drafts", async () => {
  await expect(
    authorizeSelection(request("owner", ["read:public_store"]), "read"),
  ).rejects.toMatchObject({ name: "ForbiddenError" });
  await expect(
    authorizeSelection(request("editor", ["read:store_statement"]), "read"),
  ).rejects.toMatchObject({ name: "ForbiddenError" });
});
