import Link from "next/link";
import { Eye, LockKeyhole } from "lucide-react";

import { useI18n } from "lib/i18n";

/** Shared notice for every authenticated working-draft surface. */
export function OutletPreviewBanner({ storeSlug }: { storeSlug: string }) {
  const { t } = useI18n();

  return (
    <div className="border-b border-violet-300/20 bg-violet-400/[0.08] px-4 py-3 text-sf-fg sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <LockKeyhole
            size={18}
            className="mt-0.5 shrink-0 text-violet-300"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-black">{t("Private draft preview")}</p>
            <p className="mt-0.5 text-xs leading-5 text-sf-muted">
              {t(
                "Only authorized collaborators can see this preview. Publish the Outlet when it is ready for players.",
              )}
            </p>
          </div>
        </div>
        <Link
          href={`/store/${storeSlug}/manage`}
          className="inline-flex min-h-10 w-fit items-center gap-2 rounded-lg border border-sf-border bg-sf-surface px-4 py-2 text-xs font-black uppercase tracking-wider text-sf-fg transition-colors hover:border-violet-300/40"
        >
          <Eye size={15} aria-hidden="true" />
          {t("Back to management")}
        </Link>
      </div>
    </div>
  );
}
