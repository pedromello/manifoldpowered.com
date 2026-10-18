/** Prisma Migrate's session locks must not pass through Neon's transaction pool. */
export function prismaMigrationHost(
  applicationHost: string | undefined,
  migrationHost?: string,
): string | undefined {
  if (migrationHost) return migrationHost;
  if (
    applicationHost &&
    /^ep-[a-z0-9-]+-pooler(?:\.[a-z0-9-]+)+\.neon\.tech$/i.test(applicationHost)
  )
    return applicationHost.replace(/-pooler(?=\.)/i, "");
  return applicationHost;
}
