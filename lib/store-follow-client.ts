import { ApiClientError } from "lib/api-client";

export type StoreFollowStatus = { is_followed: boolean };

type ApplyStatus = (
  status: StoreFollowStatus,
  shouldRevalidate: boolean,
) => Promise<unknown> | unknown;

type UpdateOutletFollowOptions = {
  storeSlug: string;
  isFollowed: boolean;
  applyStatus: ApplyStatus;
  request?: typeof fetch;
};

/**
 * Applies the mutation optimistically and owns its rollback boundary.
 *
 * Keeping this outside the component makes the failure path deterministic and
 * unit-testable without adding a browser test stack to this repository.
 */
export async function updateOutletFollow({
  storeSlug,
  isFollowed,
  applyStatus,
  request = fetch,
}: UpdateOutletFollowOptions) {
  const previous = { is_followed: isFollowed };
  const optimistic = { is_followed: !isFollowed };

  await applyStatus(optimistic, false);

  try {
    const response = await request("/api/v1/store-follows", {
      method: optimistic.is_followed ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store_slug: storeSlug }),
    });

    if (!response.ok) {
      throw new ApiClientError(
        response.status,
        "Could not update the Outlet follow state",
      );
    }

    const confirmed = (await response.json()) as StoreFollowStatus;
    if (typeof confirmed.is_followed !== "boolean") {
      throw new ApiClientError(
        response.status,
        "The Outlet follow response was invalid",
      );
    }

    await applyStatus(confirmed, false);
    return confirmed;
  } catch (error) {
    await applyStatus(previous, false);
    throw error;
  }
}
