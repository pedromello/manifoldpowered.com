import { prisma } from "infra/database";
import { eventLimit } from "infra/product_event_config";

export async function pruneProductEvents(
  options: { now?: Date; batchSize?: number; maxBatches?: number } = {},
) {
  const now = options.now ?? new Date();
  const batchSize = Math.max(1, Math.min(1000, options.batchSize ?? 1000));
  const maxBatches = Math.max(1, Math.min(100, options.maxBatches ?? 20));
  const retentionDays = eventLimit("PRODUCT_EVENTS_RETENTION_DAYS", 90);
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
  let events = 0,
    buckets = 0;
  for (let i = 0; i < maxBatches; i++) {
    const deleted = await prisma.$executeRaw`
      WITH expired AS (
        SELECT id FROM product_events WHERE received_at < ${cutoff}
        ORDER BY received_at, id LIMIT ${batchSize} FOR UPDATE SKIP LOCKED
      )
      DELETE FROM product_events e USING expired WHERE e.id = expired.id
    `;
    events += deleted;
    if (deleted < batchSize) break;
  }
  for (let i = 0; i < maxBatches; i++) {
    const deleted = await prisma.$executeRaw`
      WITH expired AS (
        SELECT bucket_key, window_start FROM product_event_ingest_buckets WHERE expires_at < ${now}
        ORDER BY expires_at LIMIT ${batchSize} FOR UPDATE SKIP LOCKED
      )
      DELETE FROM product_event_ingest_buckets b USING expired
      WHERE b.bucket_key = expired.bucket_key AND b.window_start = expired.window_start
    `;
    buckets += deleted;
    if (deleted < batchSize) break;
  }
  return {
    events,
    buckets,
    cutoff: cutoff.toISOString(),
    bounded: true,
    events_capped: events === batchSize * maxBatches,
    buckets_capped: buckets === batchSize * maxBatches,
  };
}
