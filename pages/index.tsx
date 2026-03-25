import Head from "next/head";
import Image from "next/image";

export default function Home() {
  return (
    <div className="container">
      <Head>
        <title>Manifold</title>
        <link rel="icon" href="/images/brand/manifold-ico.ico" />
      </Head>
      <main className="content">
        <img
          src="/images/brand/manifold-logo.png"
          alt="Manifold Logo"
          className="logo"
        />
        <h1 className="title">Manifold</h1>
        <h2 className="subtitle">
          The foundational platform for the next generation of digital game
          stores.
        </h2>

        <p className="status-warning" role="alert">
          Project status: pre-release. Manifold is in active development and
          does not yet have a final version open to the public.
        </p>

        <p className="intro">
          Manifold allows anyone (communities, streamers, and curators) to
          create their own game store (called Outlets) simply and directly. Game
          Developers publish their games once and multiply their reach through
          endless storefronts.
        </p>

        <div className="text">
          <div className="language-block">
            <h2 className="section-header">How Manifold Changes the Game</h2>
            <p>
              We connect those who develop, those who sell, and those who play
              in a single, integrated ecosystem. Here are the benefits for
              everyone:
            </p>

            <div className="diagram-wrapper">
              <Image
                src="/images/manifold-diagram-hd.png"
                alt="Manifold Diagram"
                width={1920}
                height={1440}
                className="diagram-image"
              />
            </div>

            <div className="section">
              <h3 className="section-subheader">
                1. For Content Creators: A New Revenue Stream
              </h3>
              <p>
                Have you ever imagined having your own official game store?
                Manifold makes it a reality. It&apos;s your chance to create a
                new revenue stream and an authentic space for your audience.
                Instead of just recommending a game, you can sell it directly to
                your fans.
              </p>
              <ul>
                <li>
                  <strong>The Scenario:</strong> Imagine you focus on{" "}
                  <em>cozy games</em>. You open your own storefront on Manifold,
                  handpicking which titles from our catalog best match your
                  viewers.
                </li>
                <li>
                  <strong>The Benefit:</strong> Your store will only feature the
                  curation your community loves. You monetize your influence by
                  earning a share of the sales, while we handle all the
                  security, payments, and game delivery.
                </li>
              </ul>
            </div>

            <div className="section">
              <h3 className="section-subheader">
                2. For Developers: More Reach, Less Effort
              </h3>
              <p>
                Expanding your game&apos;s audience shouldn&apos;t mean managing
                dozens of different platforms or begging for visibility against
                a single algorithm.
              </p>
              <ul>
                <li>
                  <strong>The Scenario:</strong> You&apos;ve launched your indie
                  game and want maximum conversion. Instead of knocking on every
                  distributor&apos;s door, you publish your game{" "}
                  <strong>just once</strong> on Manifold.
                </li>
                <li>
                  <strong>The Benefit:</strong> Once approved, your game becomes
                  available to thousands of niche stores. Segmented storefronts
                  that love your game&apos;s genre can start selling it
                  immediately. You find engaged fans and generate organic sales
                  without any extra work.
                </li>
              </ul>
            </div>

            <div className="section">
              <h3 className="section-subheader">
                3. For Players: Your Games in One Place
              </h3>
              <p>
                You shouldn&apos;t be forced to install dozens of different
                launchers just because you decided to support different
                creators.
              </p>
              <ul>
                <li>
                  <strong>The Scenario:</strong> You bought a farming game from
                  your favorite streamer&apos;s store. A week later, you bought
                  an FPS from your e-sports team&apos;s store.
                </li>
                <li>
                  <strong>The Benefit:</strong> It doesn&apos;t matter which
                  partner you bought from. All games acquired in the Manifold
                  ecosystem are available in your{" "}
                  <strong>single, centralized library</strong>. With just one
                  login, you download your games and seamlessly sync your
                  progress.
                </li>
              </ul>
            </div>
          </div>

          <div className="closing">
            <p>
              We are just getting started. Manifold is being built in public by
              people who believe that creating an amazing game should be harder
              than distributing it.
            </p>
            <p className="spacing-top">
              We are looking for early adopters, contributors, and dreamers.
            </p>
          </div>
        </div>

        <div className="actions">
          <a
            href="https://github.com/pedromello/manifoldpowered.com"
            target="_blank"
            rel="noopener noreferrer"
            className="cta"
            aria-label="View on GitHub"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            <span>View on GitHub</span>
          </a>

          <a
            href="https://docs.google.com/forms/d/e/1FAIpQLScYuPMblNZLzKLLnZ6enRJ0n3_Jqvx7V9veNiesVlE4QJo3eg/viewform?usp=dialog"
            target="_blank"
            rel="noopener noreferrer"
            className="cta"
            aria-label="Follow Development"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
            </svg>
            <span>Follow Development</span>
          </a>
        </div>
      </main>

      <style jsx>{`
        .container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 3rem 2rem;
          background: var(--bg-primary);
        }

        .content {
          max-width: 680px;
          width: 100%;
        }

        .logo {
          display: block;
          max-width: 100%;
          height: auto;
          max-height: 80px;
          margin-bottom: 1.5rem;
        }

        .title {
          font-size: 2.5rem;
          font-weight: 700;
          line-height: 1.2;
          margin-bottom: 1.5rem;
          color: var(--color-black);
          letter-spacing: -0.03em;
        }

        .subtitle {
          font-size: 1.5rem;
          font-weight: 600;
          line-height: 1.2;
          margin-bottom: 1.5rem;
          color: var(--text-primary);
          letter-spacing: -0.03em;
          opacity: 0.9;
        }

        .intro {
          font-size: 1.25rem;
          line-height: 1.6;
          color: var(--text-primary);
          margin-bottom: 2.5rem;
          font-weight: 500;
          opacity: 0.85;
        }

        .status-warning {
          margin-bottom: 1.25rem;
          padding: 0.75rem 1rem;
          border: 1px solid var(--color-indigo-light);
          background: var(--color-indigo-lighter);
          color: var(--text-primary);
          border-radius: 8px;
          font-weight: 600;
          line-height: 1.5;
        }

        .text {
          font-size: 1.1rem;
          line-height: 1.7;
          color: var(--text-primary);
        }

        .text p {
          margin-bottom: 1.5rem;
        }

        .text ul {
          margin: 0.75rem 0 0 1.25rem;
        }

        .text li {
          margin-bottom: 0.8rem;
        }

        .diagram-wrapper {
          width: calc(100vw - 4rem);
          max-width: 1080px;
          position: relative;
          left: 50%;
          transform: translateX(-50%);
          margin: 3.5rem 0;
          display: flex;
          justify-content: center;
        }

        .diagram-wrapper :global(.diagram-image) {
          width: 100%;
          height: auto;
          border-radius: 12px;
          box-shadow: 0 12px 40px rgba(53, 34, 89, 0.15);
        }

        .section {
          margin-top: 2.5rem;
          margin-bottom: 2.5rem;
        }

        .section-header {
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 0.75rem;
          color: var(--color-black);
        }

        .section-subheader {
          font-size: 1.1rem;
          font-weight: 600;
          margin-bottom: 0.75rem;
          color: var(--text-primary);
        }

        .closing {
          margin-top: 3.5rem;
          color: var(--text-primary);
          border-top: 1px solid var(--color-indigo-light);
          padding-top: 2rem;
          opacity: 0.8;
        }

        .spacing-top {
          margin-top: 1rem;
        }

        .actions {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
          margin-top: 3rem;
        }

        .cta {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.625rem;
          padding: 0.875rem 1.5rem;
          color: var(--text-primary);
          font-weight: 500;
          font-size: 0.95rem;
          text-decoration: none;
          background: var(--bg-primary);
          border: 2px solid var(--text-primary);
          border-radius: 8px;
          transition: all 0.2s ease;
        }

        .cta:hover {
          background: var(--text-primary);
          color: var(--bg-primary);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(53, 34, 89, 0.2);
        }

        .cta svg {
          width: 20px;
          height: 20px;
        }

        @media (max-width: 640px) {
          .title {
            font-size: 2rem;
          }

          .intro {
            font-size: 1.1rem;
          }

          .text {
            font-size: 1rem;
          }
        }
      `}</style>

      <style jsx global>{`
        :root {
          --color-black: #000000;
          --color-purple-dark: #352259;
          --color-indigo-light: #d6cdff;
          --color-indigo-lighter: #e5dfff;
          --color-orange-light: #fffbf6;

          --bg-primary: var(--color-orange-light);
          --text-primary: var(--color-purple-dark);
        }

        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          font-family:
            -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
            "Helvetica Neue", Arial, sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          background-color: var(--bg-primary);
          color: var(--text-primary);
        }
      `}</style>
    </div>
  );
}
