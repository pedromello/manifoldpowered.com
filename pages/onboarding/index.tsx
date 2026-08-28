import Head from "next/head";
import Link from "next/link";
import { Gamepad2, Store } from "lucide-react";
import { CreatorWorkspaceLayout } from "components/creator/CreatorWorkspaceLayout";
import { useI18n } from "lib/i18n";

// Post-signup hub: an informational fork that routes new users to the right
// creation flow. Intentionally requires no auth and no account data to view —
// the CTAs point at /onboarding/create and /store/new, which each handle their
// own auth redirect. Linked from the signup success screen.
export default function OnboardingHubPage() {
  const { t } = useI18n();
  return (
    <>
      <Head>
        <title>{t("Get started | Manifold")}</title>
      </Head>

      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[#0b0812] px-4 py-12 text-white sm:px-6 lg:px-10">
        <div className="flex w-full max-w-5xl flex-col gap-10">
          <h1 className="text-center text-3xl font-black leading-tight tracking-tight md:text-5xl">
            {t("Welcome to Manifold. What do you want to build?")}
          </h1>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-4 rounded-xl border border-white/[0.08] bg-[#14101c] p-6 transition hover:border-violet-400/30 md:p-8">
              <span className="w-fit rounded-xl bg-violet-500/15 p-3 text-violet-300">
                <Gamepad2 size={24} />
              </span>
              <h2 className="text-2xl font-black">{t("I make games")}</h2>
              <p className="text-white/60 font-bold flex-1">
                {t(
                  "Distribute your games and get discovered across every Outlet on Manifold.",
                )}
              </p>
              <Link
                href="/onboarding/create"
                className="w-full rounded-xl bg-white px-4 py-3 text-center text-sm font-black uppercase tracking-wider text-black transition-colors hover:bg-white/90"
              >
                {t("Create a Studio")}
              </Link>
            </div>

            <div className="flex flex-col gap-4 rounded-xl border border-white/[0.08] bg-[#14101c] p-6 transition hover:border-fuchsia-400/30 md:p-8">
              <span className="w-fit rounded-xl bg-fuchsia-500/15 p-3 text-fuchsia-300">
                <Store size={24} />
              </span>
              <h2 className="text-2xl font-black">{t("I sell games")}</h2>
              <p className="text-white/60 font-bold flex-1">
                {t(
                  "Open an Outlet and earn by curating games for your audience.",
                )}
              </p>
              <Link
                href="/store/new"
                className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-3 text-center text-sm font-black uppercase tracking-wider text-white transition hover:brightness-110"
              >
                {t("Create an Outlet")}
              </Link>
            </div>
          </div>

          <div className="text-center">
            <Link
              href="/store"
              className="text-sm font-bold text-white/50 hover:text-white transition-colors underline underline-offset-4"
            >
              {t("I'll decide later, take me to Manifold")}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

OnboardingHubPage.getLayout = function getLayout(page: React.ReactElement) {
  return <CreatorWorkspaceLayout>{page}</CreatorWorkspaceLayout>;
};
