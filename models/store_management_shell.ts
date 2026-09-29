import type { Store, StoreMember } from "generated/prisma/client";

import type { StoreManagementCapabilities } from "models/authorization";

type StoreWithMembers = Store & { members: StoreMember[] };

/**
 * The deliberately narrow Store projection shared with all management roles.
 * In particular, do not replace this with authorization.filterOutput(): that
 * projection includes the mutable draft and is not safe for financial-only
 * delegates.
 */
export function managementShellOutput(
  foundStore: StoreWithMembers,
  capabilities: StoreManagementCapabilities,
) {
  return {
    store: {
      id: foundStore.id,
      slug: foundStore.slug,
      name: foundStore.name,
      owner_id: foundStore.owner_id,
      status: foundStore.status,
      published_at: foundStore.published_at,
    },
    capabilities,
  };
}
