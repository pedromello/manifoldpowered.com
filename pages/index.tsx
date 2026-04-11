import type { GetServerSideProps } from "next";
import Head from "next/head";
import Image from "next/image";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import EarlyAccessModal from "components/EarlyAccessModal";
import ConceptDiagram from "components/ConceptDiagram";

type AudienceKey = "creators" | "developers" | "players";

const audiences: Record<
  AudienceKey,
  {
    tabLabel: string;
    title: string;
    description: string;
    badge: string;
    hero: string;
    manifestoLead: string;
    manifestoStrong: string;
    features: Array<{ title: string; description: string }>;
    ctaTitle: string;
    ctaText: string;
  }
> = {
  developers: {
    tabLabel: "Developers",
    title: "Manifold for Developers | Multiply Your Organic Reach",
    description:
      "Publish your game once and let thousands of passionate creators champion it. Manifold connects your game directly to communities.",
    badge: "Project status: open-source pre-release",
    hero: "Launch once, distribute everywhere. Multiply your organic reach across thousands of community-driven storefronts without paying for algorithm visibility.",
    manifestoLead: "",
    manifestoStrong:
      "When you publish your game on Manifold, you plug into an expanding network of passionate streamers, curators, and communities ready to sell your game for you.",
    features: [
      {
        title: "Audience-First Discovery",
        description:
          "Instead of fighting thousands of other titles on a single front page, your game is placed directly into targeted, niche storefronts where the right audience discovers it organically.",
      },
      {
        title: "Fair Revenue, No Monopolies",
        description:
          "We provide the open-source infrastructure. Revenue is split transparently between you, the community that championed your title, and a small Manifold fee.",
      },
      {
        title: "Zero Extra Integration",
        description:
          "Upload your build once and it populates the Manifold registry, available for any verified creator to add to their storefront and sell.",
      },
    ],
    ctaTitle: "Ready to Plug In?",
    ctaText: "Reach out to be among the first to upload your game to Manifold.",
  },
  creators: {
    tabLabel: "Creators",
    title: "Manifold | Open-Source Game Distribution for Communities",
    description:
      "Empowering communities to own their game distribution. Start your own storefront, curate games, and earn revenue without depending on corporate intermediaries.",
    badge: "Project status: open-source pre-release",
    hero: "Empowering communities to own their game distribution. Start your own storefront, curate games for your audience, and earn revenue without depending on corporate intermediaries.",
    manifestoLead: "",
    manifestoStrong:
      "Manifold gives the gaming community the power to distribute games on their own terms.",
    features: [
      {
        title: "Your Community, Your Store",
        description:
          "Stop sending your audience away to Steam. With Manifold, you open a verified, branded storefront in minutes. Handpick the catalog that fits your community's vibe perfectly.",
      },
      {
        title: "Monetize Your Influence",
        description:
          "When your fans buy a game they discovered through your streams or reviews, you earn a direct revenue share. We provide the open-source infrastructure; you provide the curation.",
      },
      {
        title: "Frictionless Infrastructure",
        description:
          "You don't need to be a developer to sell games. Manifold handles payment processing integrations, secure game downloads, and the heavy lifting.",
      },
    ],
    ctaTitle: "Reclaim Distribution",
    ctaText:
      "Be among the first to break the mold and reshape how games are sold.",
  },
  players: {
    tabLabel: "Players",
    title: "Manifold for Players | One Universal Library",
    description:
      "Support creators directly without fracturing your game collection. One login, one library, endless storefronts.",
    badge: "Project status: open-source pre-release",
    hero: "Support creators directly without fracturing your game collection. One login, one library, endless storefronts.",
    manifestoLead: "",
    manifestoStrong:
      "When you buy a game through a Manifold-powered store, your money goes to the people who actually made it and the community who championed it.",
    features: [
      {
        title: "One Epic Library",
        description:
          "Whether you buy a farming sim from your favorite streamer or a competitive FPS from an esports team's page, every game goes into the same centralized dashboard.",
      },
      {
        title: "True Independence",
        description:
          "Manifold is built on open standards, promoting a DRM-free-friendly philosophy that respects your hardware and privacy.",
      },
      {
        title: "Fund Your Creators",
        description:
          "Every purchase genuinely supports the storefront you bought it from. You fund your favorite content creators, modding teams, and communities with games you were going to buy anyway.",
      },
    ],
    ctaTitle: "Play Games. Fund Creators.",
    ctaText:
      "Buy your next favorite game directly through your favorite communities. You get a great game for your library, and the creators you love get the support they deserve.",
  },
};

const audienceKeys = Object.keys(audiences) as AudienceKey[];

function getAudienceFromQuery(value: string | string[] | undefined) {
  const audience = Array.isArray(value) ? value[0] : value;

  return audienceKeys.includes(audience as AudienceKey)
    ? (audience as AudienceKey)
    : "creators";
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <article className="rounded-3xl border border-[var(--color-indigo-light)] bg-white/55 p-8 shadow-sm backdrop-blur md:p-10">
      <h3 className="text-2xl font-bold md:text-3xl">{title}</h3>
      <p className="mt-4 text-lg leading-8 text-[rgba(53,34,89,0.8)]">
        {description}
      </p>
    </article>
  );
}

export const getServerSideProps: GetServerSideProps<{
  initialAudience: AudienceKey;
}> = async ({ query }) => {
  return {
    props: {
      initialAudience: getAudienceFromQuery(query.audience),
    },
  };
};

export default function Home({
  initialAudience,
}: {
  initialAudience: AudienceKey;
}) {
  const transitionDurationMs = 180;
  const router = useRouter();
  const [selectedAudience, setSelectedAudience] =
    useState<AudienceKey>(initialAudience);
  const [isAudienceContentVisible, setIsAudienceContentVisible] =
    useState(true);
  const [isEarlyAccessModalOpen, setIsEarlyAccessModalOpen] = useState(false);
  const audienceTransitionTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const selectedContent = audiences[selectedAudience];

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    const nextAudience = getAudienceFromQuery(router.query.audience);

    if (nextAudience === selectedAudience) {
      return;
    }

    setIsAudienceContentVisible(false);

    if (audienceTransitionTimeoutRef.current) {
      clearTimeout(audienceTransitionTimeoutRef.current);
    }

    audienceTransitionTimeoutRef.current = setTimeout(() => {
      setSelectedAudience(nextAudience);
      setIsAudienceContentVisible(true);
    }, transitionDurationMs);
  }, [router.isReady, router.query.audience, selectedAudience]);

  useEffect(() => {
    return () => {
      if (audienceTransitionTimeoutRef.current) {
        clearTimeout(audienceTransitionTimeoutRef.current);
      }
    };
  }, []);

  function selectAudience(audience: AudienceKey) {
    if (audience === selectedAudience) {
      return;
    }

    if (audienceTransitionTimeoutRef.current) {
      clearTimeout(audienceTransitionTimeoutRef.current);
    }

    setIsAudienceContentVisible(false);

    audienceTransitionTimeoutRef.current = setTimeout(() => {
      setSelectedAudience(audience);
      setIsAudienceContentVisible(true);
    }, transitionDurationMs);

    router.replace(
      {
        pathname: "/",
        query: audience === "creators" ? {} : { audience },
      },
      undefined,
      { shallow: true, scroll: false },
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--color-purple-dark)]">
      <Head>
        <title>{selectedContent.title}</title>
        <meta name="description" content={selectedContent.description} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={selectedContent.title} />
        <meta property="og:description" content={selectedContent.description} />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="icon" href="/images/brand/manifold-ico.ico" />
      </Head>

      <main className="mx-auto flex w-full max-w-[100vw] flex-col gap-16 py-10 md:gap-20 md:py-16 overflow-x-hidden">
        <section className="mx-auto flex w-full max-w-4xl flex-col items-center px-6 text-center md:px-10">
          <img
            src="/images/brand/manifold-logo.png"
            alt="Manifold Logo"
            className="mx-auto h-16 w-auto"
          />

          <div className="mt-10 flex justify-center">
            <p className="inline-flex rounded-full border border-[var(--color-indigo-light)] bg-[var(--color-indigo-lighter)] px-4 py-2 text-sm font-semibold">
              {selectedContent.badge}
            </p>
          </div>

          <h1 className="mt-8 text-6xl font-black leading-none tracking-tight md:text-8xl">
            MANIFOLD
          </h1>

          <div className="mt-8 flex w-full justify-center">
            <nav
              aria-label="Select audience"
              className="grid w-full max-w-2xl gap-3 rounded-2xl border border-[var(--color-indigo-light)] bg-white/45 p-2 sm:grid-cols-3"
            >
              {audienceKeys.map((audience) => {
                const isSelected = audience === selectedAudience;

                return (
                  <button
                    type="button"
                    className={`rounded-xl px-4 py-3 text-sm font-bold transition-colors duration-200 ${
                      isSelected
                        ? "bg-[var(--color-purple-dark)] text-[var(--bg-primary)]"
                        : "hover:bg-white/70"
                    }`}
                    aria-pressed={isSelected}
                    key={audience}
                    onClick={() => selectAudience(audience)}
                  >
                    {audiences[audience].tabLabel}
                  </button>
                );
              })}
            </nav>
          </div>

          <div
            className={`mt-6 flex justify-center transform-gpu transition-all duration-200 ease-out ${
              isAudienceContentVisible
                ? "translate-y-0 opacity-100"
                : "translate-y-2 opacity-0"
            }`}
          >
            <p className="max-w-2xl text-xl leading-9 text-[rgba(53,34,89,0.8)] md:text-2xl">
              {selectedContent.hero}
            </p>
          </div>
        </section>

        <button
          type="button"
          className="w-65 mx-auto rounded-lg bg-[var(--color-purple-dark)] px-6 py-3 font-bold text-[var(--bg-primary)] hover:bg-black"
          aria-label="Request Early Access"
          onClick={() => setIsEarlyAccessModalOpen(true)}
        >
          Early Access
        </button>

        {/* =========================================
            NOSSO NOVO DIAGRAMA DE CONCEITO (DINAMICO)
            ========================================= */}
        <section className="w-full">
          <ConceptDiagram />
        </section>

        <div className="mt-8 flex w-full justify-center">
          <section className="mx-auto flex w-full max-w-4xl flex-col items-center px-6 text-center md:px-10">
            <nav
              aria-label="Select audience"
              className="grid w-full max-w-2xl gap-3 rounded-2xl border border-[var(--color-indigo-light)] bg-white/45 p-2 sm:grid-cols-3"
            >
              {audienceKeys.map((audience) => {
                const isSelected = audience === selectedAudience;

                return (
                  <button
                    type="button"
                    className={`rounded-xl px-4 py-3 text-sm font-bold transition-colors duration-200 ${
                      isSelected
                        ? "bg-[var(--color-purple-dark)] text-[var(--bg-primary)]"
                        : "hover:bg-white/70"
                    }`}
                    aria-pressed={isSelected}
                    key={audience}
                    onClick={() => selectAudience(audience)}
                  >
                    {audiences[audience].tabLabel}
                  </button>
                );
              })}
            </nav>
          </section>
        </div>

        <section
          className={`mx-auto w-full max-w-4xl px-6 text-center transform-gpu transition-all duration-200 ease-out md:px-10 ${
            isAudienceContentVisible
              ? "translate-y-0 opacity-100"
              : "translate-y-2 opacity-0"
          }`}
        >
          <h2 className="text-3xl leading-snug text-[rgba(53,34,89,0.8)] md:text-4xl">
            {selectedContent.manifestoLead}
            <strong className="block pt-4 font-bold text-[var(--color-purple-dark)]">
              {selectedContent.manifestoStrong}
            </strong>
          </h2>
        </section>

        <section
          className={`mx-auto grid w-full max-w-7xl gap-6 px-6 transform-gpu transition-all duration-200 ease-out md:grid-cols-3 md:px-10 ${
            isAudienceContentVisible
              ? "translate-y-0 opacity-100"
              : "translate-y-3 opacity-0"
          }`}
        >
          {selectedContent.features.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </section>

        <div className="mx-auto w-full max-w-7xl px-6 md:px-10">
          <section
            className={`rounded-3xl border border-[var(--color-indigo-light)] bg-[var(--color-indigo-lighter)] px-6 py-12 text-center transform-gpu transition-all duration-200 ease-out md:px-12 md:py-16 ${
              isAudienceContentVisible
                ? "translate-y-0 opacity-100"
                : "translate-y-3 opacity-0"
            }`}
          >
            <h2 className="text-4xl font-black md:text-6xl">
              {selectedContent.ctaTitle}
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[rgba(53,34,89,0.8)]">
              {selectedContent.ctaText}
            </p>

            <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
              <a
                href="https://github.com/pedromello/manifoldpowered.com"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-[var(--color-purple-dark)] px-6 py-3 font-bold hover:bg-white/60"
                aria-label="View on GitHub"
              >
                View on GitHub
              </a>
              <button
                type="button"
                className="rounded-lg bg-[var(--color-purple-dark)] px-6 py-3 font-bold text-[var(--bg-primary)] hover:bg-black"
                aria-label="Request Early Access"
                onClick={() => setIsEarlyAccessModalOpen(true)}
              >
                Early Access
              </button>
            </div>
          </section>
        </div>
      </main>

      <EarlyAccessModal
        isOpen={isEarlyAccessModalOpen}
        onClose={() => setIsEarlyAccessModalOpen(false)}
      />
    </div>
  );
}
