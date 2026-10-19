import { prisma } from "infra/database";

export const visitBindingKey = (visitId: string) =>
  "identity:visit-bound:" + visitId;

export async function visitWasBound(visitId: string) {
  return !!(await prisma.productEvent.findUnique({
    where: { event_key: visitBindingKey(visitId) },
    select: { id: true },
  }));
}

// Internal identity boundary, not a product conversion. Never update an owner.
// This guard is required whenever CLIENT collection is on, independently of SERVER facts.
export async function bindAnonymousVisit(input: {
  visit_id: string;
  anonymous_id: string;
  user_id: string;
}) {
  try {
    const result = await prisma.productEvent.createMany({
      data: [
        {
          event_key: visitBindingKey(input.visit_id),
          name: "visit_identity_bound",
          schema_version: 1,
          source: "SERVER",
          occurred_at: new Date(),
          user_id: input.user_id,
          anonymous_id: input.anonymous_id,
          visit_id: input.visit_id,
          properties: {},
        },
      ],
      skipDuplicates: true,
    });
    return result.count === 1;
  } catch {
    return false;
  } // Identity telemetry must never break authentication.
}
