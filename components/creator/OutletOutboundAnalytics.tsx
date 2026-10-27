import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { BarChart3, MousePointer2, ShoppingBag, Users } from "lucide-react";
import type { OutboundAnalytics } from "contracts/outlet-analytics";
import {
  AFFILIATE_MERCHANT_LABELS,
  AFFILIATE_PLATFORM_LABELS,
} from "contracts/outlet-affiliates";
import { useI18n } from "lib/i18n";
import { GameAutocomplete } from "components/store/GameAutocomplete";

const selectClass =
  "min-w-0 rounded-lg border border-white/15 bg-[#17121f] px-3 py-2.5 text-sm text-white focus-visible:outline-2 focus-visible:outline-violet-400";
const request = async (url: string): Promise<OutboundAnalytics> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Could not load store clicks.");
  return response.json();
};
function providerLabel(provider: string) {
  return (
    AFFILIATE_MERCHANT_LABELS[provider] ||
    AFFILIATE_PLATFORM_LABELS[provider] ||
    provider
  );
}

export function OutletOutboundAnalytics({
  storeSlug,
  global = false,
}: {
  storeSlug?: string;
  global?: boolean;
}) {
  const { t, locale } = useI18n();
  const [days, setDays] = useState("30");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [customRange, setCustomRange] = useState("");
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [kind, setKind] = useState("all");
  const [provider, setProvider] = useState("all");
  const [platform, setPlatform] = useState("all");
  const [game, setGame] = useState("all");
  const [gameTitle, setGameTitle] = useState("");
  const [placement, setPlacement] = useState("all");
  const [outlet, setOutlet] = useState(storeSlug || "");
  const endpoint = global
    ? "/api/v1/analytics/outbound"
    : `/api/v1/stores/${encodeURIComponent(storeSlug || "")}/analytics`;
  const params = new URLSearchParams();
  if (days === "custom") {
    if (customRange)
      for (const [key, value] of new URLSearchParams(customRange))
        params.set(key, value);
    else params.set("days", "30");
  } else params.set("days", days);
  if (kind !== "all") params.set("kind", kind);
  if (provider !== "all") params.set("provider", provider);
  if (platform !== "all") params.set("platform", platform);
  if (game !== "all") params.set("game_slug", game);
  if (placement !== "all") params.set("placement", placement);
  if (global && outlet) params.set("store_slug", outlet);
  const { data, error, isLoading, mutate } = useSWR(
    `${endpoint}?${params}`,
    request,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const count = (value: number) => value.toLocaleString(locale);
  function applyRange(event: FormEvent) {
    event.preventDefault();
    const start = new Date(`${from}T00:00:00.000Z`);
    let end = new Date(`${to}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    if (
      end.getTime() > Date.now() &&
      to === new Date().toISOString().slice(0, 10)
    )
      end = new Date();
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      end <= start ||
      end.getTime() - start.getTime() > 90 * 86400000 ||
      end > new Date()
    ) {
      setRangeError(t("Choose a valid period of at most 90 days."));
      return;
    }
    setRangeError(null);
    setCustomRange(
      new URLSearchParams({
        from: start.toISOString(),
        to: end.toISOString(),
      }).toString(),
    );
  }
  const totals = data?.totals;
  return (
    <section className="space-y-6" aria-labelledby="outbound-analytics-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="outbound-analytics-heading" className="text-2xl font-black">
            {t("Store clicks")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
            {t(
              global
                ? "Official and affiliate store clicks across Manifold, including direct visits."
                : "See which official and affiliate store links your Outlet visitors open.",
            )}
          </p>
        </div>
        <label className="flex flex-col gap-2 text-xs font-semibold text-white/60">
          <span>{t("Period")}</span>
          <select
            className={selectClass}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          >
            <option value="7">{t("Last 7 days")}</option>
            <option value="30">{t("Last 30 days")}</option>
            <option value="90">{t("Last 90 days")}</option>
            <option value="custom">{t("Custom period")}</option>
          </select>
        </label>
      </div>
      {days === "custom" && (
        <form className="flex flex-wrap items-end gap-3" onSubmit={applyRange}>
          <label className="flex flex-col gap-2 text-sm">
            <span>{t("From")}</span>
            <input
              type="date"
              required
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={selectClass}
            />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            <span>{t("To")}</span>
            <input
              type="date"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={selectClass}
            />
          </label>
          <button className={`${selectClass} font-bold hover:bg-white/10`}>
            {t("Apply")}
          </button>
          {rangeError && (
            <p role="alert" className="w-full text-sm text-rose-200">
              {rangeError}
            </p>
          )}
        </form>
      )}
      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-[140px] flex-1 flex-col gap-2 text-xs text-white/60">
          <span>{t("Link type")}</span>
          <select
            className={selectClass}
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="all">{t("All types")}</option>
            <option value="official">{t("Official store")}</option>
            <option value="game">{t("Affiliate game")}</option>
            <option value="gift_card">{t("Gift card")}</option>
            <option value="storefront">{t("General affiliate link")}</option>
          </select>
        </label>
        <label className="flex min-w-[140px] flex-1 flex-col gap-2 text-xs text-white/60">
          <span>{t("Store")}</span>
          <select
            className={selectClass}
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            <option value="all">{t("All stores")}</option>
            {[
              "steam",
              "nintendo",
              "playstation",
              "xbox",
              "amazon",
              "mercado_livre",
              "nuuvem",
            ].map((value) => (
              <option key={value} value={value}>
                {providerLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[140px] flex-1 flex-col gap-2 text-xs text-white/60">
          <span>{t("Platform")}</span>
          <select
            className={selectClass}
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            <option value="all">{t("All platforms")}</option>
            {Object.entries(AFFILIATE_PLATFORM_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex min-w-[200px] flex-1 flex-col gap-2 text-xs text-white/60">
          <span>{t("Game")}</span>
          <GameAutocomplete
            onSelect={(selected) => {
              setGame(selected.slug);
              setGameTitle(selected.title);
            }}
          />
          {game !== "all" && (
            <button
              className="rounded-lg border border-violet-300/25 px-3 py-2 text-left text-violet-200"
              onClick={() => {
                setGame("all");
                setGameTitle("");
              }}
            >
              {gameTitle} · {t("Clear filter")}
            </button>
          )}
        </div>
        <label className="flex min-w-[180px] flex-1 flex-col gap-2 text-xs text-white/60">
          <span>{t("Position")}</span>
          <select
            className={selectClass}
            value={placement}
            onChange={(e) => setPlacement(e.target.value)}
          >
            <option value="all">{t("All positions")}</option>
            {Object.entries({
              outlet_links: "Outlet links",
              purchase_primary: "Primary purchase button",
              purchase_alternative: "Other options",
              purchase_card: "Purchase card",
              social_store_link: "Connected store link",
              legacy: "Historical",
            }).map(([value, label]) => (
              <option key={value} value={value}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
        {global && (
          <label className="flex min-w-[160px] flex-1 flex-col gap-2 text-xs text-white/60">
            <span>{t("Outlet slug (optional)")}</span>
            <input
              className={selectClass}
              placeholder={t("All Outlets and direct visits")}
              value={outlet}
              onChange={(e) => setOutlet(e.target.value.trim())}
            />
          </label>
        )}
      </div>
      {isLoading && (
        <p role="status" className="text-sm text-white/60">
          {t("Loading store clicks...")}
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="space-y-3 rounded-xl border border-rose-300/20 p-4"
        >
          <p className="text-sm text-rose-200">
            {t("Could not load store clicks.")}
          </p>
          <button onClick={() => void mutate()} className={selectClass}>
            {t("Try again")}
          </button>
        </div>
      )}
      {data && totals && (
        <>
          {!data.collection_enabled && (
            <p
              role="status"
              className="rounded-xl border border-amber-300/25 bg-amber-300/5 p-4 text-sm text-amber-100"
            >
              {t(
                "Event collection is currently disabled. These figures may be incomplete.",
              )}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Clicks", totals.clicks, MousePointer2],
              ["Visits with clicks", totals.visits, Users],
              ["Official stores", totals.official, ShoppingBag],
              ["Affiliate links", totals.affiliate, BarChart3],
            ].map(([label, value, Icon]) => {
              const MetricIcon = Icon as typeof MousePointer2;
              return (
                <div
                  key={String(label)}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-5"
                >
                  <MetricIcon
                    size={20}
                    aria-hidden="true"
                    className="text-violet-300"
                  />
                  <p className="mt-3 text-3xl font-black">
                    {count(value as number)}
                  </p>
                  <p className="mt-1 text-sm text-white/60">
                    {t(label as string)}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="text-xs leading-5 text-white/55">
            {t(
              "Recorded clicks and visits, not unique people or confirmed sales. Browser blocking and collection gaps can affect these figures. Data is retained for up to 90 days.",
            )}
          </p>
          {totals.clicks === 0 ? (
            <div className="rounded-xl border border-dashed border-white/15 p-8 text-center">
              <BarChart3
                size={28}
                className="mx-auto text-violet-300"
                aria-hidden="true"
              />
              <h3 className="mt-3 font-bold">
                {t("No clicks recorded in this period.")}
              </h3>
              <p className="mt-2 text-sm text-white/55">
                {t(
                  "This can mean there was no activity or that collection was unavailable.",
                )}
              </p>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-white/10 p-5">
                <h3 className="mb-4 font-bold">{t("Daily clicks")}</h3>
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {data.daily.map((day) => (
                    <div
                      key={day.date}
                      className="grid grid-cols-[5rem_minmax(0,1fr)_3rem] items-center gap-3 text-xs"
                    >
                      <span className="text-white/60">
                        {new Date(
                          `${day.date.slice(0, 10)}T12:00:00Z`,
                        ).toLocaleDateString(locale, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <div
                        role="img"
                        aria-label={t(
                          "Official clicks: {official}; affiliate clicks: {affiliate}",
                          { official: day.official, affiliate: day.affiliate },
                        )}
                        className="flex h-3 overflow-hidden rounded bg-white/5"
                      >
                        <span
                          className="bg-violet-400"
                          style={{
                            width: `${(day.official / Math.max(...data.daily.map((row) => row.clicks), 1)) * 100}%`,
                          }}
                        />
                        <span
                          className="bg-sky-400"
                          style={{
                            width: `${(day.affiliate / Math.max(...data.daily.map((row) => row.clicks), 1)) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-right font-bold">
                        {count(day.clicks)}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-4 flex gap-4 text-xs text-white/60">
                  <span>
                    <span className="mr-1 text-violet-300">●</span>
                    {t("Official stores")}
                  </span>
                  <span>
                    <span className="mr-1 text-sky-300">●</span>
                    {t("Affiliate links")}
                  </span>
                </p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-left text-sm">
                  <caption className="px-4 py-4 text-left text-base font-bold">
                    {t("Destinations")}
                  </caption>
                  <thead className="text-xs text-white/50">
                    <tr>
                      {[
                        "Store",
                        "Link type",
                        "Platform",
                        "Position",
                        "Clicks",
                      ].map((label) => (
                        <th key={label} className="px-4 py-3 font-semibold">
                          {t(label)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.destinations.map((row, index) => (
                      <tr key={index} className="border-t border-white/10">
                        <td className="whitespace-nowrap px-4 py-3 font-bold">
                          {providerLabel(row.provider)}
                        </td>
                        <td className="px-4 py-3 text-white/70">
                          {t(
                            {
                              official: "Official store",
                              game: "Affiliate game",
                              gift_card: "Gift card",
                              storefront: "General affiliate link",
                            }[row.kind] || "Historical",
                          )}
                        </td>
                        <td className="px-4 py-3 text-white/70">
                          {row.platform === "legacy"
                            ? t("Historical")
                            : row.platform
                              ? providerLabel(row.platform)
                              : "—"}
                        </td>
                        <td className="px-4 py-3 text-white/60">
                          {t(
                            {
                              outlet_links: "Outlet links",
                              purchase_primary: "Primary purchase button",
                              purchase_alternative: "Other options",
                              purchase_card: "Purchase card",
                              social_store_link: "Connected store link",
                            }[row.placement] || "Historical",
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-bold">
                          {count(row.clicks)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-left text-sm">
                  <caption className="px-4 py-4 text-left text-base font-bold">
                    {t("Clicks by game")}
                  </caption>
                  <thead className="text-xs text-white/50">
                    <tr>
                      {[
                        "Game",
                        "Official stores",
                        "Affiliate links",
                        "Clicks",
                      ].map((label) => (
                        <th key={label} className="px-4 py-3">
                          {t(label)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.games.map((row, index) => (
                      <tr
                        key={row.game_id || index}
                        className="border-t border-white/10"
                      >
                        <td className="px-4 py-3 font-semibold">
                          {row.game_title ||
                            row.game_slug ||
                            t("General Outlet links")}
                        </td>
                        <td className="px-4 py-3">{count(row.official)}</td>
                        <td className="px-4 py-3">{count(row.affiliate)}</td>
                        <td className="px-4 py-3 font-bold">
                          {count(row.clicks)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {global && data.outlets?.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full text-left text-sm">
                    <caption className="px-4 py-4 text-left text-base font-bold">
                      {t("Clicks by Outlet")}
                    </caption>
                    <thead>
                      <tr>
                        <th className="px-4 py-3">{t("Outlet")}</th>
                        <th className="px-4 py-3">{t("Clicks")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.outlets.map((row, index) => (
                        <tr
                          key={row.store_id || index}
                          className="border-t border-white/10"
                        >
                          <td className="px-4 py-3">
                            {row.store_name ||
                              row.store_slug ||
                              t("Direct visits")}
                          </td>
                          <td className="px-4 py-3 font-bold">
                            {count(row.clicks)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
