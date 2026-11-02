import { prisma } from "infra/database";

const WORKFLOW = "price-refresh.yaml";
const REPOSITORY = "pedromello/manifoldpowered.com";
export function priceExecutorConfigured() {
  return Boolean(process.env.PRICE_REFRESH_GITHUB_TOKEN);
}

export async function dispatchPriceRefresh(id: string) {
  try {
    if (!priceExecutorConfigured()) throw new Error("NOT_CONFIGURED");
    const response = await fetch(
      `https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PRICE_REFRESH_GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ ref: "main", inputs: { run_id: id } }),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) throw new Error("DISPATCH_FAILED");
    return true;
  } catch {
    // Don't clobber a worker that already started after an ambiguous HTTP timeout.
    await prisma.priceRefreshRun.updateMany({
      where: { id, status: "QUEUED", lease_token: null },
      data: {
        status: "DISPATCH_FAILED",
        error_code: priceExecutorConfigured()
          ? "DISPATCH_FAILED"
          : "EXECUTOR_NOT_CONFIGURED",
      },
    });
    return false;
  }
}
