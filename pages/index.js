export default function Home() {
  return (
    <div className="container">
      <main className="content">
        <h1 className="title">Manifold</h1>

        <div className="text">
          <p className="intro">
            We are currently building a new open-source layer of infrastructure
            for game distribution.
          </p>

          <p>
            Over the years, game development has been democratized.
            <br />
            Engines became accessible.
            <br />
            Art, design, and audio tools evolved into open and shared
            ecosystems.
          </p>

          <p className="emphasis">
            Distribution, however, remained centralized.
          </p>

          <p>
            Manifold is built on the idea that distribution should not be owned
            by a single platform, but treated as shared infrastructure — just
            like many of the tools used to create games.
          </p>

          <p>
            This project is about turning distribution into something modular,
            interoperable, and accessible.
            <br />A single system that allows multiple independent stores to
            exist, grow, and connect.
          </p>

          <p className="closing">
            We are at the beginning.
            <br />
            Building in public.
            <br />
            And open to anyone who believes that creating should be harder than
            distributing.
          </p>
        </div>

        <a
          href="https://github.com/pedromello/manifoldpowered.com"
          target="_blank"
          rel="noopener noreferrer"
          className="github-link"
          aria-label="Follow the project on GitHub"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
          <span>Follow the project</span>
        </a>
      </main>

      <style jsx>{`
        .container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          background: #fafafa;
        }

        .content {
          max-width: 640px;
          width: 100%;
        }

        .title {
          font-size: 2rem;
          font-weight: 600;
          margin-bottom: 3rem;
          color: #000;
          letter-spacing: -0.02em;
        }

        .text {
          font-size: 1.05rem;
          line-height: 1.8;
          color: #333;
        }

        .text p {
          margin-bottom: 1.5rem;
        }

        .intro {
          font-size: 1.15rem;
          font-weight: 500;
          color: #000;
        }

        .emphasis {
          font-style: italic;
          color: #666;
        }

        .closing {
          margin-top: 2.5rem;
          color: #666;
        }

        .github-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.625rem;
          margin-top: 3.5rem;
          padding: 0.875rem 1.75rem;
          color: #000;
          font-weight: 500;
          font-size: 0.95rem;
          text-decoration: none;
          background: #fff;
          border: 2px solid #000;
          border-radius: 8px;
          transition: all 0.2s ease;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }

        .github-link:hover {
          background: #000;
          color: #fff;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .github-link svg {
          width: 20px;
          height: 20px;
        }

        @media (max-width: 640px) {
          .title {
            font-size: 1.5rem;
            margin-bottom: 2rem;
          }

          .text {
            font-size: 1rem;
          }

          .intro {
            font-size: 1.05rem;
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
