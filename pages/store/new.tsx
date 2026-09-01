import { useRef, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import useSWR from "swr";
import { Loader2 } from "lucide-react";
import { CreatorWorkspaceLayout } from "components/creator/CreatorWorkspaceLayout";
import { OutletValueProp } from "components/store/OutletValueProp";
import { createOutletSubmissionController } from "lib/create-outlet-client";
import { useI18n } from "lib/i18n";
import {
  CREATOR_OUTLET_FUNNEL_VERSION,
  creatorFunnelAnalytics,
} from "lib/creator-funnel-analytics";

interface CurrentUser {
  id: string;
  username: string;
}

const userFetcher = (url: string) =>
  fetch(url).then(async (res) => {
    if (!res.ok) throw new Error("Not logged in");
    return res.json();
  });

export default function StoreCreatePage() {
  const router = useRouter();
  const { t, translateError } = useI18n();

  const { error: userError, isLoading: isUserLoading } = useSWR<CurrentUser>(
    "/api/v1/user",
    userFetcher,
    { shouldRetryOnError: false },
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [submissionController] = useState(() =>
    createOutletSubmissionController(),
  );

  const isLoggedOut = !!userError;

  if (!isUserLoading && isLoggedOut) {
    router.replace(`/login?callbackUrl=${encodeURIComponent(router.asPath)}`);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setFormError(null);

    setIsSubmitting(true);
    try {
      const { ok, body } = await submissionController.submit({
        name,
        description: description.trim() || undefined,
        logoUrl: logoUrl.trim() || undefined,
      });

      if (!ok) {
        setFormError(translateError(body?.message, "Failed to create Outlet."));
        return;
      }

      const hasDescription = description.trim().length > 0;
      const hasLogo = logoUrl.trim().length > 0;
      if (hasDescription && hasLogo) {
        creatorFunnelAnalytics.brandComplete({
          funnelVersion: CREATOR_OUTLET_FUNNEL_VERSION,
          entrySurface: "create_outlet",
        });
      }
      router.push(`/store/${body!.slug}/manage`);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>{t("Create Your Outlet | Manifold")}</title>
      </Head>

      <div className="min-h-[calc(100vh-4rem)] bg-[#0b0812] px-4 py-10 text-white sm:px-6 lg:px-10 lg:py-14">
        <div className="mx-auto grid w-full max-w-5xl items-start gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
          <div className="lg:pt-4">
            <OutletValueProp />
          </div>

          <div className="flex w-full flex-col gap-6 rounded-xl border border-white/[0.08] bg-[#14101c] p-6 shadow-2xl shadow-black/20 sm:p-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-300">
                {t("New Outlet")}
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-tight">
                {t("Create your Outlet")}
              </h1>
            </div>

            {isUserLoading ? (
              <Loader2 className="animate-spin text-white/30" />
            ) : (
              <form
                onSubmit={handleSubmit}
                onChange={() => submissionController.start()}
                className="flex flex-col gap-4"
              >
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-white/40">
                    {t("Outlet name")}
                  </span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Pixel Arcade"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white placeholder:text-white/30 outline-none focus:bg-white/10 focus:border-white/20"
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-white/40">
                    {t("Description (optional)")}
                  </span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder={t("Tell players what your Outlet is about.")}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white placeholder:text-white/30 outline-none focus:bg-white/10 focus:border-white/20 resize-none"
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-white/40">
                    {t("Logo URL (optional)")}
                  </span>
                  <input
                    type="text"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white placeholder:text-white/30 outline-none focus:bg-white/10 focus:border-white/20"
                  />
                </label>

                <p className="text-xs font-bold text-white/40">
                  {t(
                    "After creating your Outlet, choose explicitly whether to show the full catalog or a selected catalog before publishing.",
                  )}
                </p>

                {formError && (
                  <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm font-bold">
                    {formError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || !name.trim()}
                  className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-3 text-sm font-black uppercase tracking-wider text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isSubmitting ? t("Creating...") : t("Create Outlet")}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

StoreCreatePage.getLayout = function getLayout(page: React.ReactElement) {
  return <CreatorWorkspaceLayout>{page}</CreatorWorkspaceLayout>;
};
