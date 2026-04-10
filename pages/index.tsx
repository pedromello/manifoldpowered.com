import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import EarlyAccessModal from "components/EarlyAccessModal";

const features = [
  {
    title: "Your Community, Your Store",
    description:
      "Stop sending your audience away to generic algorithms. With Manifold, you open a verified, branded storefront in minutes. Handpick the catalog that fits your community's vibe perfectly.",
  },
  {
    title: "Monetize Your Influence",
    description:
      "When your fans buy a game they discovered through your streams or reviews, you earn a direct revenue share. We provide the open-source infrastructure; you provide the curation.",
  },
  {
    title: "Frictionless Infrastructure",
    description:
      "You don't need to be a developer to sell games. Manifold handles the payment processing integrations, secure game downloads, and heavy lifting.",
  },
];

const audienceCards = [
  {
    title: "Are you a Game Developer?",
    description:
      "Learn how Manifold multiplies your organic reach across the world by connecting you with creators.",
    href: "/developers",
    label: "Discover Developer Benefits",
  },
  {
    title: "Are you a Player?",
    description:
      "Find out why your ultimate game library doesn't depend on heavy corporate launchers anymore.",
    href: "/players",
    label: "Explore Player Features",
  },
];

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

function AudienceCard({
  title,
  description,
  href,
  label,
}: {
  title: string;
  description: string;
  href: string;
  label: string;
}) {
  return (
    <article className="rounded-2xl border border-[var(--color-indigo-light)] bg-white/60 p-6 text-left">
      <h4 className="text-xl font-bold">{title}</h4>
      <p className="mt-3 text-[rgba(53,34,89,0.75)]">{description}</p>
      <Link
        href={href}
        className="mt-6 inline-flex font-bold underline-offset-4 hover:underline"
      >
        {label} &rarr;
      </Link>
    </article>
  );
}

export default function Home() {
  const [isEarlyAccessModalOpen, setIsEarlyAccessModalOpen] = useState(false);
  const [isDiagramOpen, setIsDiagramOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--color-purple-dark)]">
      <Head>
        <title>Manifold | Open-Source Game Distribution for Communities</title>
        <meta
          name="description"
          content="Empowering communities to own their game distribution. Start your own storefront, curate games, and earn revenue without depending on corporate intermediaries."
        />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Manifold | Own Your Game Store" />
        <meta
          property="og:description"
          content="We don't need another corporate storefront. Launch your community's official game distribution platform today."
        />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="icon" href="/images/brand/manifold-ico.ico" />
      </Head>

      <main className="mx-auto flex max-w-7xl flex-col gap-20 px-6 py-10 md:gap-28 md:px-10 md:py-16">
        <section className="grid items-center gap-10 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <img
              src="/images/brand/manifold-logo.png"
              alt="Manifold Logo"
              className="mx-auto h-16 w-auto lg:mx-0"
            />

            <p className="mt-10 inline-flex rounded-full border border-[var(--color-indigo-light)] bg-[var(--color-indigo-lighter)] px-4 py-2 text-sm font-semibold">
              Project status: open-source pre-release
            </p>

            <h1 className="mt-8 text-6xl font-black leading-none tracking-tight md:text-8xl">
              MANIFOLD
            </h1>

            <p className="mt-6 max-w-2xl text-xl leading-9 text-[rgba(53,34,89,0.8)] md:text-2xl">
              Empowering communities to own their game distribution. Start your
              own storefront, curate games for your audience, and earn revenue
              without depending on corporate intermediaries.
            </p>
          </div>

          <button
            type="button"
            className="group text-left"
            aria-label="Expand Manifold Ecosystem Diagram"
            onClick={() => setIsDiagramOpen(true)}
          >
            <Image
              src="/images/manifold-diagram-hd.png"
              alt="Manifold Ecosystem Diagram"
              width={1920}
              height={1440}
              priority={true}
              className="w-full rounded-3xl border border-[var(--color-indigo-light)] bg-white/60 shadow-xl transition group-hover:scale-[1.01]"
            />
            <span className="mt-3 block text-center text-sm font-semibold text-[rgba(53,34,89,0.72)]">
              Click to expand
            </span>
          </button>
        </section>

        <section className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl leading-snug text-[rgba(53,34,89,0.8)] md:text-5xl">
            We don&apos;t need another corporate storefront.
            <strong className="block pt-4 font-bold text-[var(--color-purple-dark)]">
              Manifold gives the gaming community the power to distribute games
              on their own terms.
            </strong>
          </h2>
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          {features.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </section>

        <section className="rounded-3xl border border-[var(--color-indigo-light)] bg-[var(--color-indigo-lighter)] px-6 py-12 text-center md:px-12 md:py-16">
          <h2 className="text-4xl font-black md:text-6xl">
            Reclaim Distribution
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[rgba(53,34,89,0.8)]">
            Manifold is an open framework currently in active development. Be
            among the first to break the mold and reshape how games are sold.
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

          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {audienceCards.map((card) => (
              <AudienceCard key={card.title} {...card} />
            ))}
          </div>
        </section>
      </main>

      <EarlyAccessModal
        isOpen={isEarlyAccessModalOpen}
        onClose={() => setIsEarlyAccessModalOpen(false)}
      />

      {isDiagramOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4"
          role="presentation"
          onMouseDown={() => setIsDiagramOpen(false)}
        >
          <section
            aria-label="Expanded Manifold Ecosystem Diagram"
            className="relative max-h-full w-full max-w-6xl overflow-auto rounded-2xl bg-[var(--bg-primary)] p-3 shadow-2xl"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-5 top-5 rounded-lg bg-[var(--color-purple-dark)] px-4 py-2 font-bold text-[var(--bg-primary)]"
              aria-label="Close expanded diagram"
              onClick={() => setIsDiagramOpen(false)}
            >
              Close
            </button>
            <Image
              src="/images/manifold-diagram-hd.png"
              alt="Manifold Ecosystem Diagram expanded"
              width={1920}
              height={1440}
              className="h-auto w-full min-w-[900px] rounded-xl"
            />
          </section>
        </div>
      ) : null}
    </div>
  );
}
