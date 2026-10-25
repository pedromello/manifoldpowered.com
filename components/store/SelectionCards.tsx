import Link from "next/link";
import useSWR from "swr";
import { useState } from "react";
import { ArrowRight, Layers } from "lucide-react";
import { GameArtwork } from "components/store/GameArtwork";
import { useI18n } from "lib/i18n";
import { selectionRequest } from "lib/selection-client";
import type {
  SelectionLibraryQuery,
  SelectionSummary,
} from "contracts/outlet-selections";
import { selectionLibraryItemPath } from "lib/selection-library";
import { Pagination, type PaginationApi } from "components/Pagination";

export function SelectionCards({
  selections,
  preview = false,
  libraryQuery,
}: {
  selections: SelectionSummary[];
  preview?: boolean;
  libraryQuery?: SelectionLibraryQuery;
}) {
  const { t } = useI18n();
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {selections.map((selection) => (
        <Link
          key={selection.id}
          id={`selection-${selection.slug}`}
          href={
            libraryQuery
              ? selectionLibraryItemPath(selection, libraryQuery, preview)
              : `${selection.public_path}${preview ? "?preview=1" : ""}`
          }
          className="group scroll-mt-24 overflow-hidden rounded-2xl border border-sf-border bg-sf-surface focus-visible:ring-2 focus-visible:ring-violet-400"
        >
          <GameArtwork src={selection.cover_url} className="aspect-[16/9]" />
          <div className="p-5">
            <h3 className="break-words text-lg font-bold">{selection.title}</h3>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-sf-muted">
              {selection.description}
            </p>
            {libraryQuery && (
              <p className="mt-3 text-xs text-sf-muted">
                {t("{count} games", { count: selection.game_slugs.length })}
              </p>
            )}
            <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-violet-300">
              {t("Explore selection")}{" "}
              <ArrowRight size={16} aria-hidden="true" />
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

type OutletSelectionsProps = { slug: string; preview?: boolean };

export function OutletSelections(props: OutletSelectionsProps) {
  return (
    <OutletSelectionPage
      key={`${props.slug}:${props.preview ?? false}`}
      {...props}
    />
  );
}

function OutletSelectionPage({ slug, preview = false }: OutletSelectionsProps) {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const { data, error } = useSWR<{
    selections: SelectionSummary[];
    pagination: PaginationApi;
  }>(
    `/api/v1/stores/${encodeURIComponent(slug)}/selections?limit=6&page=${page}${preview ? "&preview=1" : ""}`,
    selectionRequest,
  );
  if (error || !data?.selections.length)
    return <div id="outlet-selections" className="scroll-mt-24" />;
  return (
    <section
      className="mx-auto max-w-[1500px] px-4 py-8 text-white sm:px-6 lg:px-10"
      id="outlet-selections"
      aria-label={t("Game selections")}
    >
      <h2 className="mb-5 flex items-center gap-2 text-2xl font-black">
        <Layers size={22} aria-hidden="true" />
        {t("Game selections")}
      </h2>
      <SelectionCards selections={data.selections} preview={preview} />
      <div className="mt-5">
        <Pagination pagination={data.pagination} onPageChange={setPage} />
      </div>
    </section>
  );
}
