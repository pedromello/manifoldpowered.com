import { useEffect, useState } from "react";
import Head from "next/head";
import useSWR from "swr";
import { BackofficeLayout } from "components/backoffice/BackofficeLayout";
import { SelectionCarousel } from "components/storefront/default/SelectionCarousel";
import { useI18n } from "lib/i18n";
import { fetchJson } from "lib/api-client";
import { selectionRequest, type SelectionPageApi } from "lib/selection-client";
import type { SelectionSummary } from "contracts/outlet-selections";
import type { AdminHome } from "lib/home-client";

const control =
  "min-h-11 rounded-lg border border-white/15 bg-white/5 px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300 disabled:opacity-35";
type Item = AdminHome["items"][number];

export default function BackofficeHome() {
  const { t, locale, translateError } = useI18n();
  const { data, error, mutate, isLoading } = useSWR<AdminHome>(
    `/api/v1/backoffice/home?locale=${locale}`,
    fetchJson,
    { revalidateOnFocus: false },
  );
  const [items, setItems] = useState<Item[] | null>(null);
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [outlet, setOutlet] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const list = items ?? data?.items ?? [];
  const stores = useSWR<{
    stores: Array<{ id: string; slug: string; name: string; status: string }>;
  }>(
    `/api/v1/backoffice/stores?limit=20&q=${encodeURIComponent(search)}`,
    fetchJson,
  );
  const selections = useSWR<{
    selections: SelectionSummary[];
    pagination: { pages: number };
  }>(
    outlet
      ? `/api/v1/stores/${encodeURIComponent(outlet)}/selections?limit=20&page=${page}&locale=${locale}`
      : null,
    fetchJson,
  );
  const automatic = useSWR<{ selections: SelectionPageApi[] }>(
    !list.some((item) => item.entry)
      ? `/api/v1/public/selections?limit=3&locale=${locale}`
      : null,
    fetchJson,
  );
  function edit(next: Item[]) {
    if (items === null) setRevision(data?.revision ?? 0);
    setItems(next);
    setMessage("");
  }
  function move(index: number, delta: number) {
    const next = [...list];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    edit(next);
  }
  async function add(selection: SelectionSummary) {
    if (list.length >= 3 || list.some(({ id }) => id === selection.id)) return;
    setBusy(true);
    setMessage("");
    try {
      const entry = await selectionRequest<SelectionPageApi>(
        `/api/v1/stores/${encodeURIComponent(outlet)}/selections/${encodeURIComponent(selection.slug)}?locale=${locale}`,
      );
      if (!entry.games.length)
        throw new Error("This selection is unavailable in your region.");
      edit([...list, { id: entry.selection.id, entry }]);
    } catch (cause) {
      setFailed(true);
      setMessage(
        translateError(
          cause instanceof Error ? cause.message : null,
          "Could not load the selection.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setSaving(true);
    setBusy(true);
    setMessage("");
    try {
      const saved = await selectionRequest<AdminHome>(
        "/api/v1/backoffice/home",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selection_ids: list.map(({ id }) => id),
            expected_revision: items === null ? data.revision : revision,
          }),
        },
      );
      await mutate(saved, { revalidate: false });
      setItems(null);
      setRevision(saved.revision);
      setFailed(false);
      setMessage(t("Homepage saved."));
    } catch (cause) {
      setFailed(true);
      setMessage(
        translateError(
          cause instanceof Error ? cause.message : null,
          "Could not save the homepage.",
        ),
      );
    } finally {
      setBusy(false);
      setSaving(false);
    }
  }
  const preview = list.flatMap(({ entry }) => (entry ? [entry] : []));
  return (
    <>
      <Head>
        <title>{t("Homepage")} | Manifold Admin</title>
      </Head>
      <h1 className="text-3xl font-black">{t("Homepage")}</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
        {t(
          "Choose up to three published selections. If none is usable, Manifold automatically shows recent selections from different communities.",
        )}
      </p>
      {isLoading ? (
        <p className="mt-6" role="status">
          {t("Loading...")}
        </p>
      ) : error ? (
        <div role="alert" className="mt-6">
          <p>{t("Could not load the homepage.")}</p>
          <button className={control} onClick={() => mutate()}>
            {t("Retry")}
          </button>
        </div>
      ) : (
        data && (
          <>
            <div className="mt-6 rounded-xl border border-white/10 p-5">
              <p className="text-sm font-bold">
                {t("Live mode")}:{" "}
                {t(
                  data.resolved.mode === "manual"
                    ? "Editorial selection"
                    : data.resolved.mode === "automatic"
                      ? "Automatic discovery"
                      : "Catalog fallback",
                )}
              </p>
              <p className="mt-2 text-xs text-white/50">
                {t(
                  "Saving replaces the entire list immediately. Empty spaces in a usable editorial list are not filled automatically.",
                )}
              </p>
            </div>
            <section className="mt-8" aria-label={t("Editorial selection")}>
              <h2 className="text-xl font-bold">{t("Editorial selection")}</h2>
              {list.length === 0 && (
                <p className="mt-3 text-sm text-white/60">
                  {t("No manual selection. Automatic discovery will be used.")}
                </p>
              )}
              <ol className="mt-4 space-y-3">
                {list.map((item, index) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-bold">
                        {item.entry?.selection.title ||
                          t("Unavailable selection")}
                      </p>
                      <p className="mt-1 text-xs text-white/50">
                        {item.entry?.outlet.name || item.id}
                      </p>
                      {!item.entry && (
                        <p className="mt-2 text-sm text-amber-200">
                          {t(
                            "Unpublished or unavailable in this region. Remove this item before saving.",
                          )}
                        </p>
                      )}
                    </div>
                    <button
                      className={control}
                      disabled={busy || index === 0}
                      aria-label={t("Move selection up: {title}", {
                        title: item.entry?.selection.title || item.id,
                      })}
                      onClick={() => move(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      className={control}
                      disabled={busy || index === list.length - 1}
                      aria-label={t("Move selection down: {title}", {
                        title: item.entry?.selection.title || item.id,
                      })}
                      onClick={() => move(index, 1)}
                    >
                      ↓
                    </button>
                    <button
                      className={control}
                      disabled={busy}
                      onClick={() =>
                        edit(list.filter(({ id }) => id !== item.id))
                      }
                    >
                      {t("Remove")}
                    </button>
                  </li>
                ))}
              </ol>
            </section>
            <section
              className="mt-8 rounded-xl border border-white/10 p-5"
              aria-label={t("Add selection")}
            >
              <h2 className="text-xl font-bold">{t("Add selection")}</h2>
              <label className="mt-4 block text-sm">
                {t("Search Outlets")}
                <input
                  className={`${control} mt-2 block w-full`}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setOutlet("");
                  }}
                />
              </label>
              {stores.error ? (
                <p role="alert">{t("Failed to load Outlets.")}</p>
              ) : (
                <label className="mt-4 block text-sm">
                  {t("Outlet")}
                  <select
                    className={`${control} mt-2 block w-full bg-[#171120]`}
                    value={outlet}
                    onChange={(event) => {
                      setOutlet(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">{t("Choose an Outlet")}</option>
                    {(stores.data?.stores ?? [])
                      .filter((store) => store.status === "PUBLISHED")
                      .map((store) => (
                        <option key={store.id} value={store.slug}>
                          {store.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {outlet && (
                <div className="mt-4">
                  {selections.error ? (
                    <p role="alert">{t("Could not load the selection.")}</p>
                  ) : selections.isLoading ? (
                    <p role="status">{t("Loading...")}</p>
                  ) : (
                    <>
                      {!selections.data?.selections.length && (
                        <p>{t("No published selections.")}</p>
                      )}
                      <ul className="space-y-2">
                        {selections.data?.selections.map((selection) => (
                          <li
                            key={selection.id}
                            className="flex items-center justify-between gap-3"
                          >
                            <span className="min-w-0 break-words text-sm">
                              {selection.title}
                            </span>
                            <button
                              className={control}
                              disabled={
                                busy ||
                                list.length >= 3 ||
                                list.some(({ id }) => id === selection.id)
                              }
                              onClick={() => add(selection)}
                            >
                              {t("Add")}
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-4 flex gap-2">
                        <button
                          className={control}
                          disabled={page <= 1}
                          onClick={() => setPage(page - 1)}
                        >
                          {t("Previous")}
                        </button>
                        <button
                          className={control}
                          disabled={
                            page >= (selections.data?.pagination.pages ?? 1)
                          }
                          onClick={() => setPage(page + 1)}
                        >
                          {t("Next")}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </section>
            <section className="mt-8">
              <h2 className="mb-4 text-xl font-bold">{t("Preview")}</h2>
              <SelectionCarousel
                selections={
                  preview.length ? preview : (automatic.data?.selections ?? [])
                }
              />
              {!preview.length && (
                <p className="mt-3 text-sm text-white/60">
                  {t("Automatic discovery preview")}
                </p>
              )}
              {!preview.length && automatic.isLoading && (
                <p role="status" className="mt-3 text-sm text-white/60">
                  {t("Loading...")}
                </p>
              )}
              {!preview.length && automatic.error && (
                <div role="alert" className="mt-3 text-sm text-rose-300">
                  <p>{t("Could not load the selection.")}</p>
                  <button
                    className={control}
                    onClick={() => automatic.mutate()}
                  >
                    {t("Retry")}
                  </button>
                </div>
              )}
              {!preview.length &&
                automatic.data &&
                !automatic.data.selections.length && (
                  <p className="mt-3 text-sm text-white/60">
                    {t("No published selections.")}
                  </p>
                )}
            </section>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                className={`${control} bg-violet-600`}
                disabled={busy || list.some(({ entry }) => !entry)}
                onClick={save}
              >
                {t(saving ? "Saving..." : "Save")}
              </button>
              <button
                className={control}
                disabled={busy}
                onClick={() => {
                  setItems(null);
                  setMessage("");
                  void mutate();
                }}
              >
                {t("Reload saved configuration")}
              </button>
              <button
                className={control}
                disabled={busy || !list.length}
                onClick={() => edit([])}
              >
                {t("Use automatic discovery")}
              </button>
            </div>
          </>
        )
      )}
      {message && (
        <p
          role={failed ? "alert" : "status"}
          className={`mt-4 ${failed ? "text-rose-300" : "text-green-300"}`}
        >
          {message}
        </p>
      )}
    </>
  );
}
BackofficeHome.getLayout = (page: React.ReactElement) => (
  <BackofficeLayout>{page}</BackofficeLayout>
);
