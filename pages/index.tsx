import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import EarlyAccessModal from "components/EarlyAccessModal";

const features = [
  {
    alignment: "self-start w-[85%] max-md:w-full",
    title: "Your Community, Your Store",
    description:
      "Stop sending your audience away to generic algorithms. With Manifold, you open a verified, branded storefront in minutes. Handpick the catalog that fits your community's vibe perfectly, whether it's indie cozy games or hardcore competitive shooters.",
  },
  {
    alignment: "self-end w-[85%] max-md:w-full",
    title: "Monetize Your Influence",
    description:
      "When your fans buy a game they discovered through your streams or reviews, you earn a direct revenue share. We provide the open-source infrastructure to make it secure, you provide the curation and the genuine recommendation.",
  },
  {
    alignment: "self-center w-[95%] max-md:w-full",
    title: "Frictionless Infrastructure",
    description:
      "You don't need to be a developer to sell games. Manifold handles the payment processing integrations, secure game downloads, and heavy lifting. You just build your community and share the games you love.",
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

const buttonClassName =
  "inline-flex cursor-pointer items-center justify-center gap-3 rounded-[32px] border border-[var(--color-indigo-light)] bg-[rgba(214,205,255,0.2)] px-10 py-5 text-[1.1rem] font-semibold text-[var(--color-purple-dark)] no-underline transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] hover:-translate-y-1 hover:scale-[1.02] hover:bg-[rgba(214,205,255,0.5)] hover:shadow-[0_10px_30px_rgba(53,34,89,0.15)] max-md:w-full";

const featureCardClassName =
  "relative overflow-hidden rounded-[40px] border border-[rgba(214,205,255,0.6)] bg-[rgba(255,255,255,0.35)] p-16 shadow-[0_10px_30px_rgba(53,34,89,0.02)] backdrop-blur-3xl transition-[transform,background,border,box-shadow] duration-400 ease-[cubic-bezier(0.25,1,0.5,1)] hover:-translate-y-2 hover:border-[var(--color-indigo-light)] hover:bg-[rgba(255,255,255,0.6)] hover:shadow-[0_15px_40px_rgba(53,34,89,0.08)] max-md:rounded-3xl max-md:px-6 max-md:py-8";

export default function Home() {
  const [isEarlyAccessModalOpen, setIsEarlyAccessModalOpen] = useState(false);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[var(--bg-primary)] font-sans before:pointer-events-none before:absolute before:left-[-20vw] before:top-[-20vh] before:z-0 before:h-[140vh] before:w-[140vw] before:bg-[radial-gradient(circle_at_50%_10%,rgba(214,205,255,0.4)_0%,transparent_60%)] before:content-['']">
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

      <main className="relative z-[1] mx-auto flex max-w-[1400px] flex-col gap-[12vh] px-8 py-16 max-md:px-4 max-md:pb-16 max-md:pt-8">
        <section className="relative flex flex-col items-center pt-[2vh]">
          <img
            src="/images/brand/manifold-logo.png"
            alt="Manifold Logo"
            className="relative z-10 mb-10 h-auto max-h-20"
          />

          <div className="mb-12 inline-flex animate-[float_6s_ease-in-out_infinite] items-center gap-2 rounded-[32px] border border-[var(--color-indigo-light)] bg-[rgba(214,205,255,0.5)] px-5 py-2 text-[0.95rem] font-semibold text-[var(--color-purple-dark)]">
            <span className="h-2 w-2 animate-[pulse_2s_infinite] rounded-full bg-[var(--color-purple-dark)] shadow-[0_0_10px_var(--color-purple-dark)]"></span>
            Project status: open-source pre-release
          </div>

          <div>
            <h1 className="relative z-[2] bg-gradient-to-b from-[var(--color-purple-dark)] to-[rgba(53,34,89,0.2)] bg-clip-text px-8 text-center text-[clamp(4rem,15vw,15rem)] font-extrabold leading-[0.85] tracking-[-0.05em] text-transparent [-webkit-text-stroke:1px_rgba(53,34,89,0.05)] max-lg:text-[clamp(4rem,12vw,10rem)]">
              MANIFOLD
            </h1>
            <p className="relative z-[3] mx-auto mb-16 mt-6 max-w-[800px] text-center text-[clamp(1.2rem,3vw,2rem)] font-medium text-[var(--color-purple-dark)] opacity-85">
              Empowering communities to own their game distribution. Start your
              own storefront, curate games for your audience, and earn revenue
              without depending on corporate intermediaries.
            </p>
          </div>

          <div className="relative z-10 w-full max-w-[1100px] transform transition-transform duration-[600ms] ease-[cubic-bezier(0.175,0.885,0.32,1.275)] [transform:perspective(1200px)_rotateX(4deg)] hover:[transform:perspective(1200px)_rotateX(0deg)_scale(1.02)]">
            <Image
              src="/images/manifold-diagram-hd.png"
              alt="Manifold Ecosystem Diagram"
              width={1920}
              height={1440}
              priority={true}
              className="h-auto w-full rounded-[32px] border border-[rgba(53,34,89,0.08)] shadow-[0_40px_80px_rgba(53,34,89,0.15),0_0_60px_rgba(214,205,255,0.4)]"
            />
          </div>
        </section>

        <section className="mx-auto max-w-[900px] text-center">
          <h2 className="text-[clamp(1.5rem,4vw,2.5rem)] font-normal leading-[1.5] text-[rgba(53,34,89,0.8)]">
            We don&apos;t need another corporate storefront. <br />
            <strong className="font-semibold text-[var(--color-purple-dark)]">
              Manifold gives the gaming community the power to distribute games
              on their own terms. A fully open-source infrastructure for
              creators to launch verified stores in minutes.
            </strong>
          </h2>
        </section>

        <section className="mx-auto flex max-w-[1060px] flex-col gap-16">
          {features.map((feature) => (
            <div
              className={`${featureCardClassName} ${feature.alignment}`}
              key={feature.title}
            >
              <div className="absolute left-0 right-0 top-0 h-0.5 bg-[linear-gradient(90deg,transparent,var(--color-purple-dark)_50%,transparent)] opacity-30"></div>
              <h3 className="mb-6 text-[2.2rem] font-bold leading-tight tracking-[-0.02em] text-[var(--color-purple-dark)]">
                {feature.title}
              </h3>
              <p className="text-xl leading-[1.6] text-[rgba(53,34,89,0.85)]">
                {feature.description}
              </p>
            </div>
          ))}
        </section>

        <section className="mb-24 mt-16 rounded-[40px] border border-[rgba(214,205,255,0.6)] bg-[linear-gradient(180deg,transparent,rgba(214,205,255,0.3)_100%)] px-8 py-28 text-center max-md:rounded-3xl max-md:px-6 max-md:py-12">
          <h2 className="mb-6 text-[clamp(2.5rem,6vw,4rem)] font-extrabold leading-tight text-[var(--color-purple-dark)]">
            Reclaim Distribution
          </h2>
          <p className="mx-auto mb-12 max-w-[600px] text-xl leading-[1.6] text-[rgba(53,34,89,0.8)]">
            Manifold is an open framework currently in active development. Be
            among the first to break the mold and reshape how games are sold.
          </p>

          <div className="flex flex-wrap justify-center gap-6 max-md:w-full max-md:flex-col">
            <a
              href="https://github.com/pedromello/manifoldpowered.com"
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClassName}
              aria-label="View on GitHub"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              View on GitHub
            </a>
            <button
              type="button"
              className={`${buttonClassName} border-0 bg-[var(--color-purple-dark)] text-[var(--text-secondary)] hover:bg-[var(--color-black)] hover:shadow-[0_10px_40px_rgba(53,34,89,0.3)]`}
              aria-label="Request Early Access"
              onClick={() => setIsEarlyAccessModalOpen(true)}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
              </svg>
              Early Access
            </button>
          </div>

          <div className="mt-28 flex flex-wrap justify-center gap-8 max-md:flex-col max-md:items-center">
            {audienceCards.map((card) => (
              <div
                className="relative max-w-[440px] flex-1 overflow-hidden rounded-[32px] border border-[rgba(214,205,255,0.6)] bg-[rgba(255,255,255,0.4)] px-10 py-12 text-left transition-[transform,box-shadow,background,border] duration-300 before:absolute before:left-0 before:top-0 before:h-full before:w-[5px] before:bg-[var(--color-purple-dark)] before:transition-[width] before:duration-300 before:content-[''] hover:-translate-y-2 hover:border-[var(--color-indigo-light)] hover:bg-[rgba(255,255,255,0.7)] hover:shadow-[0_15px_40px_rgba(53,34,89,0.08)] hover:before:w-2 max-md:w-full max-md:min-w-full max-md:px-6 max-md:py-8"
                key={card.title}
              >
                <h4 className="mb-4 text-[1.6rem] font-extrabold leading-tight text-[var(--color-purple-dark)]">
                  {card.title}
                </h4>
                <p className="mb-8 text-[1.15rem] leading-[1.5] text-[rgba(53,34,89,0.85)]">
                  {card.description}
                </p>
                <Link href={card.href} legacyBehavior>
                  <a className="inline-flex items-center text-[1.1rem] font-bold text-[var(--color-purple-dark)] no-underline transition-colors duration-200 hover:text-[var(--color-black)] hover:underline">
                    {card.label} &rarr;
                  </a>
                </Link>
              </div>
            ))}
          </div>
        </section>
      </main>

      <EarlyAccessModal
        isOpen={isEarlyAccessModalOpen}
        onClose={() => setIsEarlyAccessModalOpen(false)}
      />
    </div>
  );
}
