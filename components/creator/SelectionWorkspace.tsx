import { useState, type FormEvent } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  Eye,
  Globe,
  Copy,
} from "lucide-react";
import { GameAutocomplete } from "components/store/GameAutocomplete";
import { Pagination, type PaginationApi } from "components/Pagination";
import { useI18n } from "lib/i18n";
import { localizedPath } from "lib/seo";
import { selectionRequest } from "lib/selection-client";
import {
  selectionCreateSchema,
  MAX_SELECTION_GAMES,
  type SelectionSummary,
  type SelectionInput,
} from "contracts/outlet-selections";

type Readiness = {
  ready: boolean;
  blockers: Array<{ code: string; message: string }>;
};
type Publication = {
  selection: SelectionSummary;
  readiness?: Readiness;
  games?: Array<{ slug: string; title: string }>;
};
const empty: SelectionInput = {
  slug: "",
  title: "",
  description: "",
  cover_url: null,
  image_urls: [],
  game_slugs: [],
};
const fieldClass =
  "mt-2 w-full rounded-xl border border-white/15 bg-[#0d0913] px-3 py-3 text-sm outline-none focus:border-violet-400 disabled:opacity-50";

function fromSelection(row: SelectionSummary): SelectionInput {
  return {
    slug: row.slug,
    title: row.title,
    description: row.description,
    cover_url: row.cover_url,
    image_urls: row.image_urls,
    game_slugs: row.game_slugs,
  };
}

type SelectionWorkspaceProps = {
  storeSlug: string;
  canEdit: boolean;
  canPublish: boolean;
};

export function SelectionWorkspace(props: SelectionWorkspaceProps) {
  // A different outlet must never inherit another outlet's editable draft or
  // a late response from its requests during client-side navigation.
  return <SelectionWorkspaceDraft key={props.storeSlug} {...props} />;
}

function SelectionWorkspaceDraft({
  storeSlug,
  canEdit,
  canPublish,
}: SelectionWorkspaceProps) {
  const { t, locale } = useI18n();
  const [page, setPage] = useState(1);
  const path = `/api/v1/stores/${encodeURIComponent(storeSlug)}/selections`;
  const {
    data,
    error: listError,
    mutate,
  } = useSWR<{ selections: SelectionSummary[]; pagination: PaginationApi }>(
    `${path}?preview=1&limit=20&page=${page}`,
    selectionRequest,
    { revalidateOnFocus: false },
  );
  const [row, setRow] = useState<SelectionSummary | null>(null);
  const [form, setForm] = useState<SelectionInput>(empty);
  const [gameTitles, setGameTitles] = useState<Record<string, string>>({});
  const [imageText, setImageText] = useState("");
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const cleanForm = {
    ...form,
    image_urls: imageText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  };
  const dirty = row
    ? JSON.stringify(cleanForm) !== JSON.stringify(fromSelection(row))
    : true;
  const hasUnsavedChanges = row
    ? dirty
    : Boolean(
        form.slug ||
        form.title ||
        form.description ||
        form.cover_url ||
        imageText ||
        form.game_slugs.length,
      );

  function display(selection: SelectionSummary) {
    setRow(selection);
    setForm(fromSelection(selection));
    setImageText(selection.image_urls.join("\n"));
  }
  function newSelection() {
    setRow(null);
    setForm(empty);
    setGameTitles({});
    setImageText("");
    setReadiness(null);
    setError("");
    setMessage("");
  }
  async function inspect(slug: string) {
    const result = await selectionRequest<Publication>(
      `${path}/${encodeURIComponent(slug)}/publication`,
    );
    return result;
  }
  async function load(selection: SelectionSummary) {
    setPending(true);
    setError("");
    setMessage("");
    try {
      const result = await inspect(selection.slug);
      display(result.selection);
      setGameTitles(
        Object.fromEntries(
          (result.games ?? []).map((game) => [game.slug, game.title]),
        ),
      );
      setReadiness(result.readiness ?? null);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not load the selection.",
      );
    } finally {
      setPending(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    const parsed = selectionCreateSchema.safeParse(cleanForm);
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message || "The selection input is invalid.",
      );
      return;
    }
    setPending(true);
    try {
      const fields = {
        title: parsed.data.title,
        description: parsed.data.description,
        cover_url: parsed.data.cover_url,
        image_urls: parsed.data.image_urls,
        game_slugs: parsed.data.game_slugs,
      };
      const result = await selectionRequest<Publication>(
        row ? `${path}/${encodeURIComponent(row.slug)}` : path,
        {
          method: row ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            row
              ? { ...fields, expected_draft_revision: row.draft_revision }
              : parsed.data,
          ),
        },
      );
      display(result.selection);
      setReadiness(null);
      setMessage("Selection draft saved.");
      await mutate().catch(() => undefined);
      try {
        const state = await inspect(result.selection.slug);
        setReadiness(state.readiness ?? null);
      } catch {
        /* The accepted save remains successful. */
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save the selection. Reload before retrying.",
      );
    } finally {
      setPending(false);
    }
  }
  async function changePublication(action: "publish" | "unpublish") {
    if (!row || dirty) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const result = await selectionRequest<Publication>(
        `${path}/${encodeURIComponent(row.slug)}/publication`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            expected_draft_revision: row.draft_revision,
          }),
        },
      );
      display(result.selection);
      setMessage(
        action === "publish" ? "Selection published." : "Selection withdrawn.",
      );
      await mutate().catch(() => undefined);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not publish the selection. Reload before retrying.",
      );
    } finally {
      setPending(false);
    }
  }
  function move(index: number, offset: number) {
    const next = [...form.game_slugs];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    setForm({ ...form, game_slugs: next });
  }
  async function copyLink() {
    if (!row) return;
    try {
      await navigator.clipboard.writeText(
        new URL(localizedPath(locale, row.public_path), window.location.origin)
          .href,
      );
      setMessage("Link copied");
    } catch {
      setError("Copy the public page address to share this selection.");
    }
  }
  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black">{t("Game selections")}</h2>
          <p className="mt-2 text-sm leading-6 text-white/55">
            {t(
              "Publish named groups of games with their own cover and shareable page.",
            )}
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={newSelection}
            disabled={pending || hasUnsavedChanges}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-bold"
          >
            <Plus size={17} />
            {t("New selection")}
          </button>
        )}
      </header>
      <div className="grid gap-5 xl:grid-cols-[280px_1fr]">
        <aside className="min-w-0 space-y-3" aria-label={t("Your selections")}>
          {listError && (
            <p role="alert" className="text-sm text-rose-200">
              {t("Could not load selections.")}
            </p>
          )}
          {data?.selections.length === 0 && (
            <p className="rounded-xl border border-dashed border-white/15 p-5 text-sm text-white/50">
              {t("Create your first selection.")}
            </p>
          )}
          {data?.selections.map((selection) => (
            <button
              key={selection.id}
              type="button"
              onClick={() => void load(selection)}
              disabled={pending || hasUnsavedChanges}
              aria-pressed={row?.id === selection.id}
              className={`w-full rounded-xl border p-4 text-left ${row?.id === selection.id ? "border-violet-400/60 bg-violet-500/10" : "border-white/10 bg-white/[0.025]"}`}
            >
              <span className="block break-words text-sm font-bold">
                {selection.title}
              </span>
              <span className="mt-1 block text-xs text-white/50">
                {t(selection.status === "PUBLISHED" ? "Published" : "Draft")}
              </span>
            </button>
          ))}
          <Pagination pagination={data?.pagination} onPageChange={setPage} />
        </aside>
        <div className="min-w-0 rounded-2xl border border-white/10 bg-[#171120] p-5 sm:p-6">
          {error && (
            <div
              role="alert"
              className="mb-4 rounded-xl bg-rose-500/10 p-4 text-sm text-rose-200"
            >
              <p>{t(error)}</p>
              {row && (
                <button
                  type="button"
                  onClick={() => void load(row)}
                  disabled={pending}
                  className="mt-2 underline"
                >
                  {t("Reload latest selection")}
                </button>
              )}
            </div>
          )}
          {message && (
            <p role="status" className="mb-4 text-sm text-emerald-200">
              {t(message)}
            </p>
          )}
          <form onSubmit={save}>
            <fieldset disabled={!canEdit || pending} className="space-y-5">
              <label className="block text-sm font-semibold">
                {t("Selection title")}
                <input
                  required
                  maxLength={120}
                  className={fieldClass}
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                />
              </label>
              <label className="block text-sm font-semibold">
                {t("Selection address")}
                <input
                  required
                  disabled={Boolean(row)}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  maxLength={120}
                  className={fieldClass}
                  value={form.slug}
                  onChange={(event) =>
                    setForm({ ...form, slug: event.target.value })
                  }
                />
                <span className="mt-1 block text-xs font-normal text-white/45">
                  {t("The page address stays stable after creation.")}
                </span>
              </label>
              <label className="block text-sm font-semibold">
                {t("Description")}
                <textarea
                  maxLength={5000}
                  rows={5}
                  className={fieldClass}
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                />
              </label>
              <label className="block text-sm font-semibold">
                {t("Cover image URL")}
                <input
                  type="url"
                  className={fieldClass}
                  value={form.cover_url ?? ""}
                  onChange={(event) =>
                    setForm({ ...form, cover_url: event.target.value || null })
                  }
                />
              </label>
              <label className="block text-sm font-semibold">
                {t("Gallery image URLs")}
                <textarea
                  rows={3}
                  className={fieldClass}
                  value={imageText}
                  onChange={(event) => setImageText(event.target.value)}
                />
                <span className="mt-1 block text-xs font-normal text-white/45">
                  {t("Up to six HTTPS image URLs, one per line.")}
                </span>
              </label>
              <div>
                <p className="mb-2 text-sm font-semibold">
                  {t("Games in this selection")}
                </p>
                <GameAutocomplete
                  endpoint={`/api/v1/stores/${encodeURIComponent(storeSlug)}/search?preview=1`}
                  onSelect={(game) => {
                    setGameTitles((current) => ({
                      ...current,
                      [game.slug]: game.title,
                    }));
                    if (form.game_slugs.length >= MAX_SELECTION_GAMES) {
                      setError("A selection can contain up to 100 games.");
                      return;
                    }
                    if (!form.game_slugs.includes(game.slug))
                      setForm({
                        ...form,
                        game_slugs: [...form.game_slugs, game.slug],
                      });
                  }}
                />
                <ol className="mt-3 space-y-2">
                  {form.game_slugs.map((slug, index) => (
                    <li
                      key={slug}
                      className="flex items-center gap-2 rounded-xl border border-white/10 p-3"
                    >
                      <span className="min-w-0 flex-1 break-words text-sm">
                        {index + 1}. {gameTitles[slug] || slug}
                      </span>
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                        aria-label={t("Move {game} up", {
                          game: gameTitles[slug] || slug,
                        })}
                        className="rounded-lg p-2 disabled:opacity-25"
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        type="button"
                        disabled={index === form.game_slugs.length - 1}
                        onClick={() => move(index, 1)}
                        aria-label={t("Move {game} down", {
                          game: gameTitles[slug] || slug,
                        })}
                        className="rounded-lg p-2 disabled:opacity-25"
                      >
                        <ArrowDown size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            game_slugs: form.game_slugs.filter(
                              (value) => value !== slug,
                            ),
                          })
                        }
                        aria-label={t("Remove {game}", {
                          game: gameTitles[slug] || slug,
                        })}
                        className="rounded-lg p-2 text-rose-200"
                      >
                        <Trash2 size={16} />
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
              {canEdit && (
                <button
                  type="submit"
                  disabled={pending}
                  className="min-h-11 rounded-xl bg-violet-600 px-5 text-sm font-bold disabled:opacity-50"
                >
                  {t(pending ? "Saving..." : "Save selection draft")}
                </button>
              )}
            </fieldset>
          </form>
          {hasUnsavedChanges && (
            <button
              type="button"
              disabled={pending}
              className="mt-4 min-h-11 px-1 text-sm font-semibold text-white/60 underline"
              onClick={() => {
                if (row) display(row);
                else newSelection();
                setError("");
                setMessage("");
              }}
            >
              {t("Discard unsaved changes")}
            </button>
          )}
          {row && (
            <div className="mt-6 space-y-4 border-t border-white/10 pt-5">
              <p className="text-sm leading-6 text-white/55">
                {t(
                  "Draft changes become public only when you publish this selection.",
                )}
              </p>
              {dirty && (
                <p className="text-sm text-amber-200">
                  {t("Save your changes before publishing.")}
                </p>
              )}
              {readiness && readiness.blockers.length > 0 && (
                <ul className="space-y-2 text-sm text-amber-100">
                  {readiness.blockers.map((blocker) => (
                    <li key={blocker.code}>{t(blocker.message)}</li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-3">
                <Link
                  href={`${row.public_path}?preview=1`}
                  target="_blank"
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-semibold"
                >
                  <Eye size={16} />
                  {t("Preview saved selection")}
                </Link>
                {canPublish && (
                  <button
                    type="button"
                    disabled={pending || dirty || readiness?.ready === false}
                    onClick={() => void changePublication("publish")}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-bold disabled:opacity-40"
                  >
                    <Globe size={16} />
                    {t("Publish selection")}
                  </button>
                )}
                {row.status === "PUBLISHED" && (
                  <>
                    <Link
                      href={row.public_path}
                      target="_blank"
                      className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 text-sm font-semibold"
                    >
                      {t("View public selection")}
                    </Link>
                    <button
                      type="button"
                      onClick={() => void copyLink()}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-semibold"
                    >
                      <Copy size={16} />
                      {t("Copy public link")}
                    </button>
                    {canPublish && (
                      <button
                        type="button"
                        disabled={pending || dirty}
                        onClick={() => void changePublication("unpublish")}
                        className="min-h-11 rounded-xl border border-rose-300/25 px-4 text-sm font-semibold text-rose-200 disabled:opacity-40"
                      >
                        {t("Withdraw selection")}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
