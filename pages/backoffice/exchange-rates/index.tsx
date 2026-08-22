import { useState } from "react";
import Head from "next/head";
import useSWR, { mutate } from "swr";
import { Loader2, Plus } from "lucide-react";
import { BackofficeLayout } from "components/backoffice/BackofficeLayout";

interface ExchangeRate {
  id: string;
  base_currency: string;
  quote_currency: string;
  rate: string;
  source: "AUTOMATIC" | "BULK" | "MANUAL";
  effective_at: string;
  created_at: string;
}

interface ExchangeRatesResponse {
  exchange_rates: ExchangeRate[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

interface Currency {
  code: string;
  enabled: boolean;
}

interface CurrenciesResponse {
  currencies: Currency[];
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const SOURCE_LABELS: Record<ExchangeRate["source"], string> = {
  AUTOMATIC: "Automatic",
  BULK: "Bulk",
  MANUAL: "Manual",
};

export default function BackofficeExchangeRatesPage() {
  const [baseFilter, setBaseFilter] = useState("");
  const [quoteFilter, setQuoteFilter] = useState("");
  const [page, setPage] = useState(1);
  const [isRecording, setIsRecording] = useState(false);

  const queryParams = new URLSearchParams();
  if (baseFilter) queryParams.set("base_currency", baseFilter);
  if (quoteFilter) queryParams.set("quote_currency", quoteFilter);
  queryParams.set("page", String(page));
  queryParams.set("limit", "20");

  const key = `/api/v1/backoffice/exchange-rates?${queryParams.toString()}`;
  const { data, isLoading, error } = useSWR<ExchangeRatesResponse>(
    key,
    fetcher,
  );

  const { data: currencyData } = useSWR<CurrenciesResponse>(
    "/api/v1/backoffice/currencies?limit=100",
    fetcher,
  );
  const currencyCodes = (currencyData?.currencies ?? []).map(
    (currency) => currency.code,
  );

  const rates = data?.exchange_rates ?? [];
  const pagination = data?.pagination;

  return (
    <>
      <Head>
        <title>Exchange Rates | Manifold Admin</title>
      </Head>

      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-black">Exchange Rates</h1>
            <p className="text-sm font-bold text-white/40 mt-1">
              Rates are append-only. Recording a new one never replaces the old,
              so a past conversion stays reproducible from the rate that was in
              effect at the time.
            </p>
          </div>
          <button
            onClick={() => setIsRecording(true)}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-black uppercase tracking-wider text-white transition hover:brightness-110"
          >
            <Plus size={16} />
            Record Rate
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <CurrencySelect
            label="Base"
            value={baseFilter}
            codes={currencyCodes}
            onChange={(value) => {
              setBaseFilter(value);
              setPage(1);
            }}
          />
          <CurrencySelect
            label="Quote"
            value={quoteFilter}
            codes={currencyCodes}
            onChange={(value) => {
              setQuoteFilter(value);
              setPage(1);
            }}
          />
        </div>

        <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-white/50 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left">Pair</th>
                <th className="px-4 py-3 text-left">Rate</th>
                <th className="px-4 py-3 text-left">Source</th>
                <th className="px-4 py-3 text-left">Effective</th>
                <th className="px-4 py-3 text-left">Recorded</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <Loader2 className="animate-spin inline-block text-white/30" />
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-12 text-center text-rose-300 font-bold"
                  >
                    Failed to load exchange rates.
                  </td>
                </tr>
              ) : rates.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-12 text-center text-white/40 font-bold"
                  >
                    No exchange rates recorded yet.
                  </td>
                </tr>
              ) : (
                rates.map((rate) => {
                  const isFuture = new Date(rate.effective_at) > new Date();
                  return (
                    <tr key={rate.id} className="border-t border-white/5">
                      <td className="px-4 py-3 font-black text-white">
                        {rate.base_currency} → {rate.quote_currency}
                      </td>
                      <td className="px-4 py-3 text-white/80 font-bold tabular-nums">
                        {rate.rate}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 rounded-md bg-white/5 text-white/60 text-xs font-black uppercase tracking-wider">
                          {SOURCE_LABELS[rate.source]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white/60">
                        {new Date(rate.effective_at).toLocaleString()}
                        {isFuture && (
                          <span
                            className="ml-2 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-xs font-black uppercase tracking-wider"
                            title="Not in effect yet — today's prices still use the previous rate."
                          >
                            Scheduled
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-white/40">
                        {new Date(rate.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm font-bold text-white/70 disabled:opacity-30"
            >
              Previous
            </button>
            <span className="text-sm font-bold text-white/50">
              Page {pagination.page} of {pagination.pages}
            </span>
            <button
              disabled={page >= pagination.pages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm font-bold text-white/70 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {isRecording && (
        <RecordRateModal
          codes={currencyCodes}
          onClose={() => setIsRecording(false)}
          onSaved={() => {
            setIsRecording(false);
            mutate(key);
          }}
        />
      )}
    </>
  );
}

function CurrencySelect({
  label,
  value,
  codes,
  onChange,
}: {
  label: string;
  value: string;
  codes: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-xs font-black uppercase tracking-wider text-white/40">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white outline-none focus:bg-white/10 focus:border-white/20"
      >
        <option value="">Any</option>
        {codes.map((code) => (
          <option key={code} value={code} className="bg-[#14101c]">
            {code}
          </option>
        ))}
      </select>
    </label>
  );
}

function RecordRateModal({
  codes,
  onClose,
  onSaved,
}: {
  codes: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [baseCurrency, setBaseCurrency] = useState("USD");
  const [quoteCurrency, setQuoteCurrency] = useState("");
  const [rate, setRate] = useState("");
  const [source, setSource] = useState<ExchangeRate["source"]>("MANUAL");
  const [effectiveAt, setEffectiveAt] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function submit() {
    setFormError(null);
    setIsSaving(true);

    const response = await fetch("/api/v1/backoffice/exchange-rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base_currency: baseCurrency,
        quote_currency: quoteCurrency,
        rate: Number(rate),
        source,
        // Left empty means "in effect now"; the API defaults it.
        ...(effectiveAt
          ? { effective_at: new Date(effectiveAt).toISOString() }
          : {}),
      }),
    });

    setIsSaving(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setFormError(body?.message || "Failed to record rate.");
      return;
    }

    onSaved();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-xl border border-white/[0.08] bg-[#14101c] p-6 shadow-2xl">
        <h2 className="text-xl font-black mb-1">Record Exchange Rate</h2>
        <p className="text-sm font-bold text-white/40 mb-4">
          This adds a new rate rather than editing any existing one.
        </p>

        {formError && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm font-bold">
            {formError}
          </div>
        )}

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-black uppercase tracking-wider text-white/40">
                Base
              </span>
              <select
                value={baseCurrency}
                onChange={(e) => setBaseCurrency(e.target.value)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white outline-none focus:bg-white/10 focus:border-white/20"
              >
                {codes.map((code) => (
                  <option key={code} value={code} className="bg-[#14101c]">
                    {code}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-black uppercase tracking-wider text-white/40">
                Quote
              </span>
              <select
                value={quoteCurrency}
                onChange={(e) => setQuoteCurrency(e.target.value)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white outline-none focus:bg-white/10 focus:border-white/20"
              >
                <option value="" className="bg-[#14101c]">
                  Select...
                </option>
                {codes.map((code) => (
                  <option key={code} value={code} className="bg-[#14101c]">
                    {code}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-black uppercase tracking-wider text-white/40">
              Rate
            </span>
            <input
              type="number"
              step="0.00000001"
              min="0"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="5.43210000"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white placeholder:text-white/30 outline-none focus:bg-white/10 focus:border-white/20 tabular-nums"
            />
            <span className="text-xs font-bold text-white/30">
              How many {quoteCurrency || "quote"} units one {baseCurrency} buys.
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-black uppercase tracking-wider text-white/40">
              Source
            </span>
            <select
              value={source}
              onChange={(e) =>
                setSource(e.target.value as ExchangeRate["source"])
              }
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-bold text-white outline-none focus:bg-white/10 focus:border-white/20"
            >
              <option value="MANUAL" className="bg-[#14101c]">
                Manual
              </option>
              <option value="BULK" className="bg-[#14101c]">
                Bulk
              </option>
              <option value="AUTOMATIC" className="bg-[#14101c]">
                Automatic
              </option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-black uppercase tracking-wider text-white/40">
              Effective from
            </span>
            <input
              type="datetime-local"
              value={effectiveAt}
              onChange={(e) => setEffectiveAt(e.target.value)}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white outline-none focus:bg-white/10 focus:border-white/20"
            />
            <span className="text-xs font-bold text-white/30">
              Leave empty to take effect now. A future date is stored but
              won&apos;t affect prices until it arrives.
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-white/60 hover:text-white font-bold text-sm"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={isSaving || !quoteCurrency || !rate}
            className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-black uppercase tracking-wider text-white transition hover:brightness-110 disabled:opacity-40"
          >
            {isSaving ? "Recording..." : "Record Rate"}
          </button>
        </div>
      </div>
    </div>
  );
}

BackofficeExchangeRatesPage.getLayout = function getLayout(
  page: React.ReactElement,
) {
  return <BackofficeLayout>{page}</BackofficeLayout>;
};
