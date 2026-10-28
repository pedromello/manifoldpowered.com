import Link from "next/link";
import useSWR from "swr";
import { ArrowRight, Layers } from "lucide-react";
import { GameArtwork } from "components/store/GameArtwork";
import type { SelectionSummary } from "contracts/outlet-selections";
import { useI18n } from "lib/i18n";
import { selectionRequest } from "lib/selection-client";
import { selectionLibraryPath } from "lib/selection-library";

export function OutletSelectionShowcase({
  slug,
  preview = false,
}: {
  slug: string;
  preview?: boolean;
}) {
  const { t } = useI18n();
  const { data } = useSWR<{ selections: SelectionSummary[] }>(
    `/api/v1/stores/${encodeURIComponent(slug)}/selections?limit=3&order=newest${preview ? "&preview=1" : ""}`,
    selectionRequest,
  );
  const [lead, ...secondary] = data?.selections ?? [];
  if (!lead) return <div id="outlet-selections" className="scroll-mt-24" />;
  const href = (selection: SelectionSummary) =>
    `${selection.public_path}${preview ? "?preview=1" : ""}`;
  return (
    <section
      id="outlet-selections"
      aria-label={t("Game selections")}
      className="mx-auto max-w-[1380px] scroll-mt-24 px-4 pt-10 text-sf-fg sm:px-8 lg:pt-12"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-2xl font-black sm:text-3xl">
          <Layers size={23} aria-hidden="true" />
          {t("Game selections")}
        </h2>
        <Link
          href={selectionLibraryPath(slug, {}, preview)}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-bold text-sf-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sf-accent"
        >
          {t("View all selections")} <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <div
        className={`grid gap-4 ${secondary.length ? "lg:grid-cols-[1.5fr_1fr]" : "max-w-3xl"}`}
      >
        <Link
          href={href(lead)}
          className="group min-w-0 overflow-hidden rounded-2xl border border-sf-border bg-sf-surface focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sf-accent"
        >
          <GameArtwork src={lead.cover_url} className="aspect-video" />
          <div className="p-5 sm:p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sf-accent">
              {t("Featured selection")}
            </p>
            <h3 className="mt-2 break-words text-2xl font-black sm:text-3xl">
              {lead.title}
            </h3>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-sf-muted">
              {lead.description}
            </p>
            <span className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-violet-300">
              {t("Explore selection")}{" "}
              <ArrowRight size={16} aria-hidden="true" />
            </span>
          </div>
        </Link>
        {secondary.length > 0 && (
          <div className="flex min-w-0 flex-col gap-3">
            {secondary.map((selection) => (
              <Link
                key={selection.id}
                href={href(selection)}
                className="group grid min-w-0 grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] items-center gap-4 overflow-hidden rounded-2xl border border-sf-border bg-sf-surface p-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sf-accent"
              >
                <GameArtwork
                  src={selection.cover_url}
                  className="aspect-video rounded-lg"
                />
                <div className="min-w-0 py-1">
                  <h3 className="break-words text-sm font-black sm:text-base">
                    {selection.title}
                  </h3>
                  <span className="mt-2 inline-flex min-h-11 items-center gap-2 text-xs font-bold text-violet-300 sm:text-sm">
                    {t("Explore selection")}{" "}
                    <ArrowRight size={14} aria-hidden="true" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
