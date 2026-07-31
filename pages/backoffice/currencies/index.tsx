import { useState } from "react";
import Head from "next/head";
import useSWR, { mutate } from "swr";
import { Ban, CheckCircle2, Loader2, Pencil, Plus } from "lucide-react";
import { BackofficeLayout } from "components/backoffice/BackofficeLayout";

interface Currency {
  id: string;
  code: string;
  symbol: string;
  decimal_places: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface CurrenciesResponse {
  currencies: Currency[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type EnabledFilter = "all" | "true" | "false";

export default function BackofficeCurrenciesPage() {
  const [enabledFilter, setEnabledFilter] = useState<EnabledFilter>("all");
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editTarget, setEditTarget] = useState<Currency | null>(null);
  const [disableTarget, setDisableTarget] = useState<Currency | null>(null);

  const queryParams = new URLSearchParams();
  if (enabledFilter !== "all") queryParams.set("enabled", enabledFilter);
  queryParams.set("page", String(page));
  queryParams.set("limit", "20");

  const key = `/api/v1/backoffice/currencies?${queryParams.toString()}`;
  const { data, isLoading, error } = useSWR<CurrenciesResponse>(key, fetcher);

  const currencies = data?.currencies ?? [];
  const pagination = data?.pagination;

  async function setEnabled(currency: Currency, enabled: boolean) {
    setActionError(null);

    const response = await fetch(
      `/api/v1/backoffice/currencies/${currency.code}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      },
    );

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setActionError(body?.message || "Failed to update currency.");
      return;
    }

    setDisableTarget(null);
    mutate(key);
  }

  async function enableCurrency(currency: Currency) {
    const confirmed = window.confirm(
      `Enable ${currency.code}? Products priced in it become visible again.`,
    );
    if (!confirmed) return;

    await setEnabled(currency, true);
  }

  return (
    <>
      <Head>
        <title>Currencies | Manifold Admin</title>
      </Head>

      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-black">Currencies</h1>
            <p className="text-sm font-bold text-white/40 mt-1">
              USD is the base currency — every product is priced in it, and
              other currencies are derived.
            </p>
          </div>
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500 text-black font-black text-sm uppercase tracking-wider hover:bg-indigo-400 transition-colors"
          >
            <Plus size={16} />
            New Currency
          </button>
        </div>

        {actionError && (
          <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm font-bold">
            {actionError}
          </div>
        )}

        <div className="flex items-center gap-2">
          {(
            [
              ["all", "All"],
              ["true", "Enabled"],
              ["false", "Disabled"],
            ] as [EnabledFilter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => {
                setEnabledFilter(value);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-colors ${
                enabledFilter === value
                  ? "bg-white/10 text-white"
                  : "text-white/40 hover:text-white hover:bg-white/5"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-white/10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-white/50 text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-left">Code</th>
                <th className="px-4 py-3 text-left">Symbol</th>
                <th className="px-4 py-3 text-left">Decimals</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
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
                    Failed to load currencies.
                  </td>
                </tr>
              ) : currencies.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-12 text-center text-white/40 font-bold"
                  >
                    No currencies found.
                  </td>
                </tr>
              ) : (
                currencies.map((currency) => (
                  <tr key={currency.id} className="border-t border-white/5">
                    <td className="px-4 py-3 font-black text-white">
                      {currency.code}
                    </td>
                    <td className="px-4 py-3 text-white/60">
                      {currency.symbol}
                    </td>
                    <td className="px-4 py-3 text-white/60">
                      {currency.decimal_places}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-md text-xs font-black uppercase tracking-wider ${
                          currency.enabled
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-rose-500/20 text-rose-300"
                        }`}
                      >
                        {currency.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditTarget(currency)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 text-white/70 hover:bg-white/10 hover:text-white text-xs font-black uppercase tracking-wider transition-colors"
                        >
                          <Pencil size={14} />
                          Edit
                        </button>
                        {currency.enabled ? (
                          <button
                            onClick={() => setDisableTarget(currency)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 text-xs font-black uppercase tracking-wider transition-colors"
                          >
                            <Ban size={14} />
                            Disable
                          </button>
                        ) : (
                          <button
                            onClick={() => enableCurrency(currency)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 text-xs font-black uppercase tracking-wider transition-colors"
                          >
                            <CheckCircle2 size={14} />
                            Enable
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
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

      {isCreating && (
        <CurrencyFormModal
          onClose={() => setIsCreating(false)}
          onSaved={() => {
            setIsCreating(false);
            mutate(key);
          }}
        />
      )}

      {editTarget && (
        <CurrencyFormModal
          currency={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null);
            mutate(key);
          }}
        />
      )}

      {disableTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1D0F3B] p-6 shadow-2xl">
            <h2 className="text-xl font-black mb-1">
              Disable {disableTarget.code}?
            </h2>
            <p className="text-sm text-white/50 font-bold mb-4">
              Every product priced in {disableTarget.code} disappears from the
              storefront for anyone browsing in it — including products with a
              fixed {disableTarget.code} price. No prices are deleted, so
              re-enabling restores everything exactly as it was.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDisableTarget(null)}
                className="px-4 py-2 rounded-xl text-white/60 hover:text-white font-bold text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => setEnabled(disableTarget, false)}
                className="px-4 py-2 rounded-xl bg-rose-500 text-black font-black text-sm uppercase tracking-wider hover:bg-rose-400 transition-colors"
              >
                Disable {disableTarget.code}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CurrencyFormModal({
  currency,
  onClose,
  onSaved,
}: {
  currency?: Currency;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = Boolean(currency);
  const [code, setCode] = useState(currency?.code ?? "");
  const [symbol, setSymbol] = useState(currency?.symbol ?? "");
  const [decimalPlaces, setDecimalPlaces] = useState(
    String(currency?.decimal_places ?? 2),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function submit() {
    setFormError(null);
    setIsSaving(true);

    // The code is immutable: it is the reference every exchange rate and price
    // override points at, so editing only ever sends the display fields.
    const response = isEditing
      ? await fetch(`/api/v1/backoffice/currencies/${currency!.code}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol,
            decimal_places: Number(decimalPlaces),
          }),
        })
      : await fetch("/api/v1/backoffice/currencies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            symbol,
            decimal_places: Number(decimalPlaces),
          }),
        });

    setIsSaving(false);

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setFormError(body?.message || "Failed to save currency.");
      return;
    }

    onSaved();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1D0F3B] p-6 shadow-2xl">
        <h2 className="text-xl font-black mb-4">
          {isEditing ? `Edit ${currency!.code}` : "New Currency"}
        </h2>

        {formError && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm font-bold">
            {formError}
          </div>
        )}

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-black uppercase tracking-wider text-white/40">
              ISO 4217 code
            </span>
            <input
              type="text"
              value={isEditing ? currency!.code : code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              disabled={isEditing}
              maxLength={3}
              placeholder="BRL"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white placeholder:text-white/30 outline-none focus:bg-white/10 focus:border-white/20 disabled:opacity-40"
            />
            {isEditing && (
              <span className="text-xs font-bold text-white/30">
                The code can&apos;t change — rates and price overrides point at
                it.
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-black uppercase tracking-wider text-white/40">
              Symbol
            </span>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              maxLength={8}
              placeholder="R$"
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white placeholder:text-white/30 outline-none focus:bg-white/10 focus:border-white/20"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-black uppercase tracking-wider text-white/40">
              Decimal places
            </span>
            <input
              type="number"
              min={0}
              max={4}
              value={decimalPlaces}
              onChange={(e) => setDecimalPlaces(e.target.value)}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white outline-none focus:bg-white/10 focus:border-white/20"
            />
            <span className="text-xs font-bold text-white/30">
              How many decimals to display. Amounts are always stored at full
              precision regardless.
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
            disabled={isSaving}
            className="px-4 py-2 rounded-xl bg-indigo-500 text-black font-black text-sm uppercase tracking-wider hover:bg-indigo-400 transition-colors disabled:opacity-40"
          >
            {isSaving ? "Saving..." : isEditing ? "Save Changes" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

BackofficeCurrenciesPage.getLayout = function getLayout(
  page: React.ReactElement,
) {
  return <BackofficeLayout>{page}</BackofficeLayout>;
};
