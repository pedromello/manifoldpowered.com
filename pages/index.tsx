import Image from "next/image";

export default function Home() {
  return (
    <div className="container">
      <main className="content">
        <h1 className="title">Manifold</h1>
        <h2 className="subtitle">
          The Shared Infrastructure for the Next Generation of Game Stores.
        </h2>

        <p className="status-warning" role="alert">
          Project status: pre-release. Manifold is in active development and no
          production-ready product is available yet.
        </p>

        <p className="intro">
          Manifold is an open-source infrastructure that allows
          anyone—communities, streamers, and curators—to launch their own
          digital game store. Developers upload once; Outlets sell everywhere.
        </p>

        <div className="text">
          <div className="language-block">
            <h2 className="section-header">How Manifold Works in Practice</h2>
            <p>
              Manifold is an ecosystem designed to connect those who create,
              those who sell, and those who play. Here is how the infrastructure
              works for each party:
            </p>

            <Image
              src="/images/manifold-diagram.png"
              alt="How Manifold Works"
              width={1024}
              height={768}
            />

            <div className="section">
              <h3 className="section-subheader">
                1. For Creators and Communities: A New Revenue Stream and
                Engagement Hub
              </h3>
              <p>
                Have you ever imagined having your own official game store? Most
                creators and communities haven&apos;t even considered this
                possibility, but Manifold makes it a reality. It&apos;s your
                chance to create a new source of extra income and an exclusive
                space to interact with your fans. Instead of just recommending a
                game in your video or Discord server, you can sell it directly
                to your audience.
              </p>
              <ul>
                <li>
                  <strong>The Use Case:</strong> Imagine you are a content
                  creator focused on <em>Cozy Games</em>. You can use Manifold
                  to open your own official storefront. You handpick which games
                  from our ecosystem you want to sell to your audience.
                </li>
                <li>
                  <strong>The Result:</strong> Your store will only feature
                  farming sims, puzzles, and relaxing narratives. No horror or
                  violent games will ever appear on your storefront. You
                  monetize your influence by earning a share from the games your
                  community would buy anyway, while we handle all the invisible
                  technical infrastructure.
                </li>
              </ul>
            </div>

            <div className="section">
              <h3 className="section-subheader">
                2. For Developers: One Upload, Hundreds of Storefronts
              </h3>
              <p>
                Expanding your game&apos;s reach shouldn&apos;t mean managing
                dozens of different distribution dashboards or fighting a single
                algorithm.
              </p>
              <ul>
                <li>
                  <strong>The Use Case:</strong> You just finished your indie
                  game and want maximum distribution. Instead of knocking on
                  every door, you upload your game <strong>just once</strong> to
                  the Manifold dashboard.
                </li>
                <li>
                  <strong>The Result:</strong> Once approved, your game becomes
                  available in our central catalog (the backend). From that
                  moment on, any niche store in the network interested in your
                  game&apos;s genre can add it to their storefront. Your game
                  gains massive reach and connects with highly engaged audiences
                  without any extra effort on your part.
                </li>
              </ul>
            </div>

            <div className="section">
              <h3 className="section-subheader">
                3. For Players: Freedom of Choice, Unified Library
              </h3>
              <p>
                You shouldn&apos;t have to fragment your games across multiple
                launchers just because you wanted to support different
                communities.
              </p>
              <ul>
                <li>
                  <strong>The Use Case:</strong> You bought a farming simulator
                  from your favorite <em>Cozy Games</em> streamer&apos;s store,
                  and the following week, you bought a shooter from your
                  e-sports clan&apos;s FPS-focused store.
                </li>
                <li>
                  <strong>The Result:</strong> It doesn&apos;t matter which
                  &quot;Outlet&quot; (store) you bought them from. Every game
                  you purchase within the Manifold ecosystem goes straight to
                  your
                  <strong>single, centralized library</strong>. One login gives
                  you full access to all your games and saved progress in one
                  place.
                </li>
              </ul>
            </div>
          </div>

          <div className="closing">
            <p>
              We are at the beginning. Manifold is currently in active
              development, built in public by developers who believe creating a
              game should be harder than distributing it.
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
          background: #fafafa;
        }

        .content {
          max-width: 680px;
          width: 100%;
        }

        .title {
          font-size: 2.5rem;
          font-weight: 700;
          line-height: 1.2;
          margin-bottom: 1.5rem;
          color: #000;
          letter-spacing: -0.03em;
        }

        .subtitle {
          font-size: 1.5rem;
          font-weight: 600;
          line-height: 1.2;
          margin-bottom: 1.5rem;
          color: #000;
          letter-spacing: -0.03em;
        }

        .intro {
          font-size: 1.25rem;
          line-height: 1.6;
          color: #444;
          margin-bottom: 2.5rem;
          font-weight: 500;
        }

        .status-warning {
          margin-bottom: 1.25rem;
          padding: 0.75rem 1rem;
          border: 1px solid #ffb86b;
          background: #fff4e5;
          color: #7a4100;
          border-radius: 8px;
          font-weight: 600;
          line-height: 1.5;
        }

        .text {
          font-size: 1.1rem;
          line-height: 1.7;
          color: #333;
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

        .section {
          margin-top: 2.5rem;
          margin-bottom: 2.5rem;
        }

        .section-header {
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 0.75rem;
          color: #000;
        }

        .section-subheader {
          font-size: 1.1rem;
          font-weight: 600;
          margin-bottom: 0.75rem;
          color: #111;
        }

        .closing {
          margin-top: 3.5rem;
          color: #666;
          border-top: 1px solid #eee;
          padding-top: 2rem;
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
          color: #000;
          font-weight: 500;
          font-size: 0.95rem;
          text-decoration: none;
          background: #fff;
          border: 2px solid #000;
          border-radius: 8px;
          transition: all 0.2s ease;
        }

        .cta:hover {
          background: #000;
          color: #fff;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
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
        }
      `}</style>
    </div>
  );
}
