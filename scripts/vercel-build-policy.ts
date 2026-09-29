export type VercelBuildStep = "generate" | "migrate" | "build";

/**
 * Preview deployments share integration infrastructure and must never mutate
 * its schema. Production remains the single migration authority immediately
 * before compiling the application that consumes that schema.
 */
export function vercelBuildSteps(
  environment: string | undefined,
): VercelBuildStep[] {
  return environment === "production"
    ? ["generate", "migrate", "build"]
    : ["generate", "build"];
}
