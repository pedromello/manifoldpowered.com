import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Gamepad2,
  Library,
  Sparkles,
  Store,
  UploadCloud,
  X,
} from "lucide-react";

const DEMO_NOTICE_KEY = "manifold-demo-notice-dismissed";

const STEPS = [
  {
    icon: UploadCloud,
    label: "Developers publish once",
    detail: "One catalog, ready for every Outlet.",
  },
  {
    icon: Store,
    label: "Creators curate",
    detail: "Each Outlet reflects a community's taste.",
  },
  {
    icon: Library,
    label: "Players keep one library",
    detail: "Your collection stays together across Outlets.",
  },
];

export function StoreWelcome() {
  const [showDemoNotice, setShowDemoNotice] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setShowDemoNotice(sessionStorage.getItem(DEMO_NOTICE_KEY) !== "true");
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  function dismissDemoNotice() {
    sessionStorage.setItem(DEMO_NOTICE_KEY, "true");
    setShowDemoNotice(false);
  }

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-8 md:gap-10">
      {showDemoNotice && (
        <aside className="flex items-start gap-3 rounded-2xl border border-sf-accent/30 bg-sf-accent/10 px-4 py-3 text-sm text-white/80">
          <Sparkles
            size={18}
            className="mt-0.5 shrink-0 text-sf-accent"
            aria-hidden="true"
          />
          <p className="flex-1 font-bold leading-relaxed">
            You&apos;re exploring the Manifold preview. The games, prices, and
            studios shown here are sample content and are not currently for
            sale.
          </p>
          <button
            type="button"
            onClick={dismissDemoNotice}
            className="shrink-0 rounded-lg p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Dismiss preview notice"
          >
            <X size={18} />
          </button>
        </aside>
      )}

      <div className="grid items-end gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <div className="flex flex-col items-start gap-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-white/60">
            <Gamepad2 size={16} aria-hidden="true" />
            Game distribution, powered by communities
          </div>

          <div className="flex flex-col gap-4">
            <h1 className="max-w-[12ch] text-5xl font-black leading-[0.95] tracking-[-0.045em] text-white md:text-7xl lg:text-8xl">
              One library. Endless storefronts.
            </h1>
            <p className="max-w-2xl text-lg font-bold leading-relaxed text-white/60 md:text-xl">
              Discover games through creators you trust, publish once across the
              network, or launch an Outlet for your own community.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
            <a
              href="#catalog"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3.5 text-sm font-black uppercase tracking-wider text-[#1D0F3B] transition-transform hover:-translate-y-0.5"
            >
              Explore games
              <ArrowRight size={17} aria-hidden="true" />
            </a>
            <Link
              href="/onboarding/create"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-3.5 text-sm font-black uppercase tracking-wider text-white transition-colors hover:bg-white/10"
            >
              Publish a game
            </Link>
            <Link
              href="/store/new"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-3.5 text-sm font-black uppercase tracking-wider text-white transition-colors hover:bg-white/10"
            >
              Create an Outlet
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-3" aria-label="How Manifold works">
          <p className="mb-1 text-xs font-black uppercase tracking-[0.18em] text-white/40">
            How Manifold works
          </p>
          {STEPS.map(({ icon: Icon, label, detail }, index) => (
            <div
              key={label}
              className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-black text-[#1D0F3B]">
                {index + 1}
              </span>
              <Icon
                size={20}
                className="hidden shrink-0 text-sf-accent sm:block"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="font-black text-white">{label}</p>
                <p className="text-sm font-bold text-white/45">{detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
