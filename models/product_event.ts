import type { Prisma } from "generated/prisma/client";
import { serverEventsEnabled } from "infra/product_event_config";
import { ServiceError } from "infra/errors";
import type { ProductEventContext } from "infra/product_event_context";
import type { ServerEventName } from "contracts/product-events";

export async function recordDomainEvent(
  client: Prisma.TransactionClient,
  input: {
    name: ServerEventName;
    relation_id: string;
    user_id: string;
    store_id?: string;
    game_id?: string;
    context?: ProductEventContext;
  },
) {
  if (!serverEventsEnabled()) return;
  try {
    await client.productEvent.create({
      data: {
        event_key: "server:" + input.name + ":" + input.relation_id,
        name: input.name,
        schema_version: 1,
        source: "SERVER",
        occurred_at: new Date(),
        user_id: input.user_id,
        store_id: input.store_id,
        game_id: input.game_id,
        anonymous_id: input.context?.anonymous_id,
        visit_id: input.context?.visit_id,
        properties: {},
      },
    });
  } catch {
    throw new ServiceError({ message: "Unable to persist product event" });
  }
}
