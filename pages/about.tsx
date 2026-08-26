import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Library, Radio, Upload } from "lucide-react";
import { IconBrandGithub } from "@tabler/icons-react";

import { StoreHomeLayout } from "components/store/StoreHomeLayout";
import { SeoHead } from "components/SeoHead";
import { useI18n } from "lib/i18n";
import { socialImageUrl } from "lib/seo";

type AudienceKey = "creators" | "developers" | "players";

const audiences: Record<
  AudienceKey,
  {
    tabLabel: string;
    title: string;
    description: string;
    hero: string;
    manifesto: string;
    features: Array<{ title: string; description: string }>;
    ctaTitle: string;
    ctaText: string;
  }
> = {
  creators: {
    tabLabel: "Creators",
    title: "Manifold for Creators | Run Your Own Game Outlet",
    description:
      "Curate games for your community, run a branded Outlet, and share in the revenue from purchases you help create.",
    hero: "Turn recommendations into a storefront your audience can trust.",
    manifesto:
      "Manifold gives creators a place to curate games, bring their own identity, and earn from the discovery they already make happen.",
    features: [
      {
        title: "Your taste, clearly presented",
        description:
          "Choose the games that fit your audience and give them a focused place to browse instead of another list of affiliate links.",
      },
      {
        title: "A share of referred sales",
        description:
          "When a player buys through your Outlet, the referral is attributed and your role in discovery can be rewarded.",
      },
      {
        title: "No commerce stack to maintain",
        description:
          "Manifold handles the shared catalog, player accounts, checkout, and library while your Outlet owns the presentation.",
      },
    ],
    ctaTitle: "Build the Outlet your community expects",
    ctaText:
      "Start with a name and a point of view. You can refine the catalog and identity as your community grows.",
  },
  developers: {
    tabLabel: "Developers",
    title: "Manifold for Developers | Publish Once, Reach More Communities",
    description:
      "Publish your game to one catalog and make it available to independent creator-run storefronts.",
    hero: "Publish once. Let the right communities carry the game further.",
    manifesto:
      "Instead of asking every creator to send players somewhere else, Manifold lets their recommendations lead to a storefront built for their audience.",
    features: [
      {
        title: "One product page",
        description:
          "Maintain the build, price, media, and long-form game description in one place while Outlets curate the same listing.",
      },
      {
        title: "Community-led discovery",
        description:
          "Reach players through creators and communities that understand why your game belongs in front of their audience.",
      },
      {
        title: "Clear attribution",
        description:
          "Know when an Outlet helped a player discover the game without creating a separate integration for every partner.",
      },
    ],
    ctaTitle: "Give your game more ways to be discovered",
    ctaText:
      "Add it once, tell its story well, and let relevant Outlets choose to put it in front of their communities.",
  },
  players: {
    tabLabel: "Players",
    title: "Manifold for Players | One Library Across Every Outlet",
    description:
      "Discover games through people you trust and keep every purchase in one Manifold library.",
    hero: "Discover through people you trust. Keep everything in one library.",
    manifesto:
      "A Manifold Outlet changes who helps you discover a game, not where your purchase lives. Your account and library work across the network.",
    features: [
      {
        title: "One account and library",
        description:
          "A purchase from any Manifold-powered Outlet goes to the same player account, ready to find and download later.",
      },
      {
        title: "More useful recommendations",
        description:
          "Browse focused selections from creators and communities instead of relying on one ranking system to decide what you see.",
      },
      {
        title: "Support discovery directly",
        description:
          "Buy the game you want while supporting the Outlet that helped you find it, without paying a separate creator fee.",
      },
    ],
    ctaTitle: "Find your next game through a better guide",
    ctaText:
      "Explore the shared catalog or start with an Outlet from a creator whose taste you already trust.",
  },
};

const audienceKeys = Object.keys(audiences) as AudienceKey[];

function getAudienceFromQuery(value: string | string[] | undefined) {
  const audience = Array.isArray(value) ? value[0] : value;
  return audienceKeys.includes(audience as AudienceKey)
    ? (audience as AudienceKey)
    : "creators";
}

const networkSteps = [
  {
    number: "01",
    title: "Developers publish once",
    description:
      "A game enters the shared catalog with its build, price, media, and story.",
    icon: Upload,
  },
  {
    number: "02",
    title: "Outlets curate",
    description:
      "Creators select the games that make sense for their own communities.",
    icon: Radio,
  },
  {
    number: "03",
    title: "Players keep one library",
    description:
      "Every purchase lands in the same account, whichever Outlet referred it.",
    icon: Library,
  },
] as const;

export const getServerSideProps: GetServerSideProps<{
  initialAudience: AudienceKey;
}> = async ({ query }) => ({
  props: { initialAudience: getAudienceFromQuery(query.audience) },
});

export default function AboutPage({
  initialAudience,
}: {
  initialAudience: AudienceKey;
}) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [selectedAudience, setSelectedAudience] =
    useState<AudienceKey>(initialAudience);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedContent = audiences[selectedAudience];

  useEffect(() => {
    if (!router.isReady) return;
    const nextAudience = getAudienceFromQuery(router.query.audience);
    if (nextAudience === selectedAudience) return;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setSelectedAudience(nextAudience);
    }, 0);
  }, [router.isReady, router.query.audience, selectedAudience]);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  function selectAudience(audience: AudienceKey) {
    if (audience === selectedAudience) return;
    setSelectedAudience(audience);
    router.replace(
      {
        pathname: "/about",
        query: audience === "creators" ? {} : { audience },
      },
      undefined,
      { shallow: true, scroll: false },
    );
  }

  return (
    <>
      <SeoHead
        locale={locale}
        path="/about"
        title={t(selectedContent.title)}
        description={t(selectedContent.description)}
        image={socialImageUrl("home", locale)}
        imageAlt={
          locale === "pt-BR"
            ? "Manifold, distribuição de jogos guiada por comunidades"
            : "Manifold, community-powered game distribution"
        }
      />
      <Head>
        <meta name="theme-color" content="#0b0812" />
      </Head>

      <main className="bg-[#0b0812] text-white">
        <section className="border-b border-white/[0.08] px-4 py-14 sm:px-6 lg:px-10 lg:py-20">
          <div className="mx-auto grid max-w-[1500px] gap-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-300">
                {t("Open-source pre-release")}
              </p>
              <h1 className="mt-5 max-w-4xl text-4xl font-black leading-[1.02] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
                {t(
                  "A game marketplace built around the people who make discovery happen.",
                )}
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-white/52 sm:text-lg">
                {t(
                  "Think Steam, but with creator-run storefronts. Games share one catalog and players keep one library.",
                )}
              </p>
            </div>

            <div className="rounded-xl border border-white/[0.09] bg-[#14101c] p-5">
              <p className="text-sm font-semibold text-white/75">
                {t("See Manifold from your perspective")}
              </p>
              <nav
                aria-label={t("Select audience")}
                className="mt-4 grid grid-cols-3 gap-1 rounded-lg bg-black/25 p-1"
              >
                {audienceKeys.map((audience) => {
                  const selected = audience === selectedAudience;
                  return (
                    <button
                      key={audience}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => selectAudience(audience)}
                      className={`rounded-md px-2 py-2.5 text-xs font-bold transition-colors sm:text-sm ${
                        selected
                          ? "bg-white/[0.1] text-white"
                          : "text-white/40 hover:text-white/75"
                      }`}
                    >
                      {t(audiences[audience].tabLabel)}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
        </section>

        <section className="px-4 py-12 sm:px-6 lg:px-10 lg:py-16">
          <div className="mx-auto max-w-[1500px]">
            <div className="grid gap-8 border-b border-white/[0.08] pb-12 lg:grid-cols-2 lg:pb-16">
              <h2 className="max-w-xl text-3xl font-black leading-tight tracking-tight sm:text-4xl">
                {t(selectedContent.hero)}
              </h2>
              <p className="max-w-2xl text-base leading-8 text-white/55 lg:justify-self-end">
                {t(selectedContent.manifesto)}
              </p>
            </div>

            <div className="grid gap-px overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.08] md:grid-cols-3">
              {selectedContent.features.map((feature) => (
                <article
                  key={feature.title}
                  className="bg-[#100c17] p-6 lg:p-8"
                >
                  <h3 className="text-lg font-bold text-white">
                    {t(feature.title)}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-white/45">
                    {t(feature.description)}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-white/[0.08] bg-[#0d0a13] px-4 py-12 sm:px-6 lg:px-10 lg:py-16">
          <div className="mx-auto max-w-[1500px]">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-300">
                  {t("The network")}
                </p>
                <h2 className="mt-3 text-3xl font-black tracking-tight">
                  {t("How Manifold works")}
                </h2>
              </div>
              <p className="max-w-lg text-sm leading-6 text-white/42">
                {t(
                  "The catalog is shared. Discovery is distributed. Ownership stays simple for the player.",
                )}
              </p>
            </div>

            <div className="mt-9 grid gap-4 md:grid-cols-3">
              {networkSteps.map(
                ({ number, title, description, icon: Icon }) => (
                  <article
                    key={number}
                    className="rounded-xl border border-white/[0.08] bg-[#14101c] p-6"
                  >
                    <div className="flex items-center justify-between text-violet-300">
                      <Icon size={20} strokeWidth={1.7} />
                      <span className="text-[11px] font-bold tracking-[0.16em] text-white/25">
                        {number}
                      </span>
                    </div>
                    <h3 className="mt-7 text-lg font-bold">{t(title)}</h3>
                    <p className="mt-2 text-sm leading-6 text-white/43">
                      {t(description)}
                    </p>
                  </article>
                ),
              )}
            </div>
          </div>
        </section>

        <section className="px-4 py-12 sm:px-6 lg:px-10 lg:py-16">
          <div className="mx-auto flex max-w-[1500px] flex-col justify-between gap-8 rounded-xl border border-violet-400/20 bg-violet-500/[0.07] p-7 sm:p-10 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-2xl font-black tracking-tight sm:text-3xl">
                {t(selectedContent.ctaTitle)}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">
                {t(selectedContent.ctaText)}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <a
                href="https://github.com/pedromello/manifoldpowered.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-5 py-3 text-sm font-bold text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                <IconBrandGithub size={17} />
                GitHub
              </a>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
              >
                {t("Create an account")}
                <ArrowRight size={17} />
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

AboutPage.getLayout = function getLayout(page: React.ReactElement) {
  return <StoreHomeLayout>{page}</StoreHomeLayout>;
};
