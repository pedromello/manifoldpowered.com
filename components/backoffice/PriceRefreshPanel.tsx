import { useState } from "react";
import useSWR from "swr";
import { useI18n } from "lib/i18n";

interface Run {
  id: string;
  provider: string;
  status: string;
  stale: boolean;
  total: number;
  processed: number;
  checked: number;
  counts: Record<string, number>;
  created_at: string;
  error_code: string | null;
}
interface ReportItem {
  id: string;
  title: string;
  provider: string;
  country: string;
  status: string;
  error_code: string | null;
  before: { amount: string | null; currency: string } | null;
  after: { amount: string | null; currency: string } | null;
}
const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Price refresh request failed");
  return response.json();
};
const button =
  "rounded-lg border border-white/20 px-3 py-2 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white/10";

export function PriceRefreshPanel() {
  const { locale } = useI18n();
  const pt = locale === "pt-BR";
  const [provider, setProvider] = useState("ALL");
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { data, error, mutate } = useSWR<{ configured: boolean; runs: Run[] }>(
    "/api/v1/backoffice/price-refresh",
    fetcher,
    { refreshInterval: 5000 },
  );
  const runId = selected ?? data?.runs[0]?.id;
  const {
    data: report,
    error: reportError,
    mutate: refreshReport,
  } = useSWR<{ run: Run; items: ReportItem[]; page: number; pages: number }>(
    runId ? `/api/v1/backoffice/price-refresh/${runId}?page=${page}` : null,
    fetcher,
    { refreshInterval: 5000 },
  );
  const run = report?.run;
  const active = data?.runs.find((entry) =>
    ["QUEUED", "RUNNING", "INTERRUPTED", "DISPATCH_FAILED"].includes(
      entry.status,
    ),
  );
  const status = (value: string) =>
    ({
      QUEUED: pt ? "Na fila" : "Queued",
      RUNNING: pt ? "Em andamento" : "Running",
      COMPLETED: pt ? "Concluída" : "Completed",
      COMPLETED_WITH_ERRORS: pt
        ? "Concluída com falhas"
        : "Completed with errors",
      DISPATCH_FAILED: pt ? "Falha ao iniciar" : "Dispatch failed",
      INTERRUPTED: pt ? "Interrompida" : "Interrupted",
      PENDING: pt ? "Pendente" : "Pending",
      CHANGED: pt ? "Alterado" : "Changed",
      UNCHANGED: pt ? "Sem alteração" : "Unchanged",
      SKIPPED: pt ? "Ignorado" : "Skipped",
      FAILED: pt ? "Falha" : "Failed",
    })[value] ?? value;
  const reason = (code: string) =>
    ({
      PRICE_UNAVAILABLE: pt
        ? "A loja não informou o preço; valor anterior preservado."
        : "No price returned; previous value preserved.",
      NEWER_PRICE_EXISTS: pt
        ? "Já existe uma consulta mais recente."
        : "A newer price already exists.",
      INVALID_REFERENCE: pt
        ? "Referência da loja ausente ou inválida."
        : "Missing or invalid store reference.",
      DISPATCH_FAILED: pt
        ? "Não foi possível iniciar o executor. Tente retomar."
        : "Could not start executor. Try resuming.",
      NotFoundError: pt
        ? "Produto indisponível nesta região."
        : "Product unavailable in this region.",
      ValidationError: pt
        ? "Preço ou edição incompatível; valor preservado."
        : "Invalid price or edition; previous value preserved.",
      HTTP_429: pt
        ? "Limite temporário da loja."
        : "Temporary store rate limit.",
    })[code] ?? code;
  async function submit(resume = false, retryFailed = false) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(
        resume
          ? `/api/v1/backoffice/price-refresh/${runId}/resume`
          : "/api/v1/backoffice/price-refresh",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            resume ? { retry_failed: retryFailed } : { provider },
          ),
        },
      );
      if (!response.ok) throw new Error("REQUEST_FAILED");
      const result: Run = await response.json();
      setSelected(result.id);
      setPage(1);
      await mutate();
      await refreshReport();
    } catch {
      setMessage(
        pt
          ? "Não foi possível solicitar a atualização. Tente novamente."
          : "Could not request refresh. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const formatPrice = (price: ReportItem["before"]) =>
    price?.amount != null
      ? new Intl.NumberFormat(locale, {
          style: "currency",
          currency: price.currency,
        }).format(Number(price.amount))
      : "—";
  return (
    <section
      aria-label={pt ? "Atualização de preços" : "Price refresh"}
      className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-4"
    >
      <h2 className="text-xl font-bold">
        {pt ? "Preços das lojas externas" : "External store prices"}
      </h2>
      <p className="text-sm text-white/60">
        {pt
          ? "Atualiza preços e promoções no Brasil e nos Estados Unidos. Você pode fechar esta página após iniciar."
          : "Refresh prices and discounts in Brazil and the United States. You can close this page after starting."}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label={pt ? "Loja para atualizar" : "Store to refresh"}
          value={provider}
          onChange={(event) => setProvider(event.target.value)}
          className="rounded-lg bg-[#14101c] border border-white/20 p-2"
        >
          <option value="ALL">{pt ? "Todas as lojas" : "All stores"}</option>
          <option value="STEAM">Steam</option>
          <option value="NINTENDO">Nintendo</option>
          <option value="PLAYSTATION">PlayStation</option>
        </select>
        <button
          className={button}
          disabled={busy || !data?.configured || Boolean(active)}
          onClick={() => submit()}
        >
          {busy
            ? pt
              ? "Solicitando…"
              : "Requesting…"
            : pt
              ? "Atualizar preços"
              : "Refresh prices"}
        </button>
        {active && (
          <button
            className={button}
            onClick={() => {
              setSelected(active.id);
              setPage(1);
            }}
          >
            {pt ? "Ver execução em aberto" : "View active run"}
          </button>
        )}
      </div>
      {data && !data.configured && (
        <p role="status" className="text-amber-300 text-sm">
          {pt
            ? "Atualização indisponível: o executor ainda não foi configurado no servidor."
            : "Refresh unavailable: the server executor has not been configured yet."}
        </p>
      )}
      {(message || error || reportError) && (
        <p role="alert" className="text-rose-300">
          {message ??
            (pt
              ? "Não foi possível carregar as execuções."
              : "Could not load refresh runs.")}
        </p>
      )}
      {data?.runs.length > 0 && (
        <label className="block text-sm">
          {pt ? "Histórico de execuções" : "Run history"}
          <select
            aria-label={pt ? "Histórico de execuções" : "Run history"}
            className="ml-3 rounded-lg bg-[#14101c] border border-white/20 p-2 max-w-full"
            value={runId}
            onChange={(e) => {
              setSelected(e.target.value);
              setPage(1);
            }}
          >
            {data.runs.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {new Date(entry.created_at).toLocaleString(locale)} ·{" "}
                {entry.provider} · {status(entry.status)}
              </option>
            ))}
          </select>
        </label>
      )}
      {run && (
        <>
          <div role="status" aria-live="polite" className="space-y-2">
            <p className="font-bold">
              {run.stale
                ? pt
                  ? "Execução parada — pode ser retomada"
                  : "Stalled — can be resumed"
                : status(run.status)}{" "}
              · {run.processed}/{run.total}
            </p>
            <progress
              aria-label={pt ? "Progresso da atualização" : "Refresh progress"}
              value={run.processed}
              max={Math.max(1, run.total)}
              className="w-full"
            />
            <p className="text-sm text-white/70">
              {pt
                ? `Verificadas: ${run.checked} · Alteradas: ${run.counts.CHANGED ?? 0} · Ignoradas: ${run.counts.SKIPPED ?? 0} · Falhas: ${run.counts.FAILED ?? 0}`
                : `Checked: ${run.checked} · Changed: ${run.counts.CHANGED ?? 0} · Skipped: ${run.counts.SKIPPED ?? 0} · Failed: ${run.counts.FAILED ?? 0}`}
            </p>
            {run.error_code && (
              <p className="text-amber-300">{reason(run.error_code)}</p>
            )}
          </div>
          <div className="flex gap-2">
            {(run.stale ||
              ["INTERRUPTED", "DISPATCH_FAILED"].includes(run.status)) && (
              <button
                className={button}
                disabled={busy || !data?.configured}
                onClick={() => submit(true)}
              >
                {pt ? "Retomar atualização" : "Resume refresh"}
              </button>
            )}
            {(run.counts.FAILED ?? 0) > 0 &&
              run.status !== "RUNNING" &&
              run.status !== "QUEUED" && (
                <button
                  className={button}
                  disabled={
                    busy ||
                    !data?.configured ||
                    Boolean(active && active.id !== run.id)
                  }
                  onClick={() => submit(true, true)}
                >
                  {pt ? "Tentar falhas novamente" : "Retry failed items"}
                </button>
              )}
          </div>
          <div className="overflow-auto max-h-96">
            <table className="w-full text-sm text-left">
              <thead>
                <tr>
                  {(pt
                    ? ["Jogo / região", "Antes", "Depois", "Resultado"]
                    : ["Game / region", "Before", "After", "Result"]
                  ).map((label) => (
                    <th className="p-2" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report?.items.map((item) => (
                  <tr className="border-t border-white/10" key={item.id}>
                    <td className="p-2">
                      {item.title}
                      <br />
                      <span className="text-white/50">
                        {item.provider} · {item.country}
                      </span>
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      {formatPrice(item.before)}
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      {formatPrice(item.after)}
                    </td>
                    <td className="p-2">
                      {status(item.status)}
                      {item.error_code && (
                        <p className="text-xs text-white/60">
                          {reason(item.error_code)}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report && report.pages > 1 && (
            <div className="flex items-center gap-3">
              <button
                className={button}
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                {pt ? "Anterior" : "Previous"}
              </button>
              <span>
                {page}/{report.pages}
              </span>
              <button
                className={button}
                disabled={page >= report.pages}
                onClick={() => setPage(page + 1)}
              >
                {pt ? "Próxima" : "Next"}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
