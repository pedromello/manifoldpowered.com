import Link from "next/link";
import Image from "next/image";
import {
  IconBrandX,
  IconBrandGithub,
  IconCircleCheck,
} from "@tabler/icons-react";

export function StoreFooter() {
  return (
    <footer className="w-full bg-[#1D0F3B] border-t border-white/5 pt-20 pb-10 overflow-hidden relative">
      {/* Decorative gradient blur */}
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-indigo-500/5 blur-[120px] rounded-full translate-x-1/2 translate-y-1/2 pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 md:px-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-12 lg:gap-8 mb-20">
          {/* Brand Section */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <Link
              href="/store"
              className="flex items-center transition-opacity hover:opacity-80 w-fit"
            >
              <Image
                src="/images/brand/manifold-logo.png"
                alt="Manifold Logo"
                width={120}
                height={120}
                className="w-auto h-8 md:h-10 px-2 rounded-lg"
              />
            </Link>
            <p className="text-white/50 text-base leading-relaxed max-w-sm ml-2">
              The open-source protocol for community-driven game distribution.
              Reclaiming the digital shelf for creators and players alike.
            </p>
            <div className="flex items-center gap-4 mt-2 ml-2">
              <a
                href="https://x.com/ManifoldPowered"
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 rounded-2xl bg-white/5 border border-white/5 text-white/40 hover:bg-white/10 hover:text-white hover:border-white/20 transition-all duration-300"
                aria-label="Follow us on X"
              >
                <IconBrandX size={20} />
              </a>
              <a
                href="https://github.com/pedromello/manifoldpowered.com"
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 rounded-2xl bg-white/5 border border-white/5 text-white/40 hover:bg-white/10 hover:text-white hover:border-white/20 transition-all duration-300"
                aria-label="View Source on GitHub"
              >
                <IconBrandGithub size={20} />
              </a>
            </div>
          </div>

          {/* Navigation Sections */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <h4 className="text-white text-xs font-black uppercase tracking-[0.2em] mb-2 px-2">
              Protocol
            </h4>
            <nav className="flex flex-col gap-1">
              <Link
                href="/store"
                className="px-2 py-2 rounded-xl text-white/40 font-bold hover:bg-white/5 hover:text-white transition-all"
              >
                Browse games
              </Link>
              <Link
                href="/about"
                className="px-2 py-2 rounded-xl text-white/40 font-bold hover:bg-white/5 hover:text-white transition-all"
              >
                About
              </Link>
              <Link
                href="/signup"
                className="px-2 py-2 rounded-xl text-white/40 font-bold hover:bg-white/5 hover:text-white transition-all"
              >
                Secure your username
              </Link>
            </nav>
          </div>

          <div className="lg:col-span-2 flex flex-col gap-6">
            <h4 className="text-white text-xs font-black uppercase tracking-[0.2em] mb-2 px-2">
              Community
            </h4>
            <nav className="flex flex-col gap-1">
              <a
                href="https://github.com/pedromello/manifoldpowered.com"
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-2 rounded-xl text-white/40 font-bold hover:bg-white/5 hover:text-white transition-all"
              >
                Developer Docs
              </a>
              <a
                href="https://x.com/ManifoldPowered"
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-2 rounded-xl text-white/40 font-bold hover:bg-white/5 hover:text-white transition-all"
              >
                X (Twitter)
              </a>
              <a
                href="mailto:contact@pedro.tec.br"
                className="px-2 py-2 rounded-xl text-white/40 font-bold hover:bg-white/5 hover:text-white transition-all"
              >
                Get in touch
              </a>
            </nav>
          </div>
        </div>

        {/* Footer Bottom */}
        <div className="pt-10 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6 px-2">
          <div className="flex items-center gap-6">
            <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">
              © 2026 MANIFOLD POWERED
            </span>
            <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <IconCircleCheck size={12} className="text-emerald-400" />
              <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                Network Status: Optimal
              </span>
            </div>
          </div>

          <div className="flex items-center gap-8">
            <Link
              href="#"
              className="text-[10px] font-black text-white/20 uppercase tracking-widest hover:text-white transition-colors"
            >
              Terms of Service
            </Link>
            <Link
              href="#"
              className="text-[10px] font-black text-white/20 uppercase tracking-widest hover:text-white transition-colors"
            >
              Privacy Policy
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
