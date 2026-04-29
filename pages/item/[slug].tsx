import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { GetServerSideProps } from "next";
import {
  Users,
  User,
  Gamepad2,
  Globe,
  ArrowLeft,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  LucideProps,
  Heart,
} from "lucide-react";

import useSWR from "swr";
import { useState } from "react";

import {
  IconBrandX,
  IconBrandYoutube,
  IconBrandSteam,
  IconBrandInstagram,
  IconBrandTiktok,
  IconBrandItch,
} from "@tabler/icons-react";

import { StoreTopNav } from "components/store/StoreTopNav";
import { StoreFooter } from "components/store/StoreFooter";
import { DiscountBadge } from "components/store/DiscountBadge";
import { SectionDivider } from "components/store/SectionDivider";
import { MediaGallery } from "components/store/MediaGallery";
import { discountBadgeColor } from "components/store/constants";
import webserver from "infra/webserver";

type GameApi = {
  id: string;
  slug: string;
  title: string;
  description: string;
  detailed_description: string;
  launch_date: string;
  price: string;
  base_price?: string;
  discount_label?: string;
  developer_name: string;
  publisher_name?: string;
  tags: string[];
  meta_tags: {
    category?: string;
    rating?: string;
    languages?: string[];
    keywords?: string[];
    platforms?: string[];
  };
  media: {
    banner?: string;
    screenshots: string[];
    icon?: string;
    videos: string[];
  };
  social_links: {
    website?: string;
    twitter?: string;
    discord?: string;
    steam_page?: string;
  };
  positive_reviews: number;
  negative_reviews: number;
  review_score: number;
};

// --- Components ---

function MetaTag({
  icon: Icon,
  label,
  active,
}: {
  icon: React.ComponentType<LucideProps>;
  label: string;
  active: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all duration-300 ${
        active
          ? "bg-white/10 border-white/20 text-white"
          : "bg-white/5 border-white/5 text-white/40 grayscale opacity-60"
      }`}
    >
      <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />
      <span className="text-sm font-bold tracking-tight">{label}</span>
    </div>
  );
}

function SocialLink({
  icon: Icon,
  href,
  label,
}: {
  icon: React.ComponentType<LucideProps>;
  href?: string;
  label: string;
}) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 text-white/60 hover:bg-white/10 hover:text-white hover:border-white/20 transition-all duration-300 group"
      title={label}
    >
      <Icon size={20} className="group-hover:scale-110 transition-transform" />
      <span className="text-sm font-bold">{label}</span>
      <ExternalLink
        size={14}
        className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
      />
    </a>
  );
}
function ReviewCard({ review }: { review: Review }) {
  return (
    <div className="p-6 rounded-3xl bg-white/5 border border-white/5 flex flex-col gap-4 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center border border-indigo-500/20 text-indigo-400 font-black">
            {review.username[0].toUpperCase()}
          </div>
          <div className="flex flex-col">
            <span className="font-black text-sm">{review.username}</span>
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
              {review.createdAt}
            </span>
          </div>
        </div>
        <div
          className={`px-3 py-1 rounded-full flex items-center gap-2 border text-[10px] font-black uppercase tracking-wider ${
            review.recommended
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-rose-500/10 border-rose-500/20 text-rose-400"
          }`}
        >
          {review.recommended ? (
            <ThumbsUp size={12} />
          ) : (
            <ThumbsDown size={12} />
          )}
          {review.recommended ? "Recommended" : "Not Recommended"}
        </div>
      </div>
      <p className="text-white/70 leading-relaxed text-sm italic">
        &quot;{review.message}&quot;
      </p>
    </div>
  );
}

function ReviewSummary({
  positive,
  negative,
}: {
  positive: number;
  negative: number;
}) {
  const total = positive + negative;
  const ratio = total > 0 ? (positive / total) * 100 : 0;

  let label = "Mixed";
  let color = "text-white/60";

  if (total === 0) {
    label = "No Reviews";
  } else if (ratio >= 90) {
    label = "Overwhelmingly Positive";
    color = "text-emerald-400";
  } else if (ratio >= 80) {
    label = "Very Positive";
    color = "text-emerald-400";
  } else if (ratio >= 70) {
    label = "Positive";
    color = "text-emerald-400";
  } else if (ratio < 40) {
    label = "Mostly Negative";
    color = "text-rose-400";
  }

  return (
    <div className="flex flex-wrap items-center gap-4 py-2">
      <div className="flex flex-col">
        <span className={`text-sm font-black uppercase tracking-wide ${color}`}>
          {label}
        </span>
        <span className="text-[10px] font-bold text-white/30 truncate">
          Based on {total.toLocaleString()} community reviews
        </span>
      </div>
      {total > 0 && (
        <>
          <div className="h-4 w-px bg-white/10 hidden sm:block" />
          <div className="flex gap-1 items-center bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
            <ThumbsUp size={12} className="text-emerald-400" />
            <span className="text-xs font-black text-emerald-400">
              {ratio.toFixed(0)}%
            </span>
          </div>
        </>
      )}
    </div>
  );
}

import { mockGames, Review } from "lib/games";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { slug } = context.query;

  try {
    const response = await fetch(
      `${webserver.getOrigin()}/api/v1/items/games/${slug}`,
    );

    if (!response.ok) {
      return {
        notFound: true,
      };
    }

    const game = await response.json();

    return {
      props: {
        game,
      },
    };
  } catch (error) {
    console.error("Error fetching game via API:", error);
    return {
      notFound: true,
    };
  }
};

export default function GameDetailsPage({ game }: { game: GameApi }) {
  const { data: wishlistData, mutate: mutateWishlist } = useSWR(
    game ? `/api/v1/wishlists?slug=${game.slug}` : null,
    (url) => fetch(url).then((res) => res.json()),
  );

  const [isToggling, setIsToggling] = useState(false);

  const toggleWishlist = async () => {
    if (!wishlistData || isToggling) return;
    setIsToggling(true);

    const isCurrentlyWishlisted = wishlistData.is_wishlisted;
    const method = isCurrentlyWishlisted ? "DELETE" : "POST";

    // Optimistic update
    mutateWishlist(
      {
        count: wishlistData.count + (isCurrentlyWishlisted ? -1 : 1),
        is_wishlisted: !isCurrentlyWishlisted,
      },
      false,
    );

    try {
      const res = await fetch("/api/v1/wishlists", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: game.slug }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          alert("You need to be logged in to add to wishlist.");
        }
        throw new Error("Failed to toggle wishlist");
      }
    } catch (error) {
      console.error(error);
    } finally {
      // Revalidate to ensure correct state
      mutateWishlist();
      setIsToggling(false);
    }
  };

  if (!game) {
    return (
      <div className="min-h-screen bg-[#1D0F3B] flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-6">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
          <p className="text-xl font-bold opacity-50">Loading archives...</p>
        </div>
      </div>
    );
  }

  const isDemo = true; // TODO: It should be implemented on game data

  return (
    <div className="min-h-screen bg-[#1D0F3B] text-white pb-24 overflow-x-hidden selection:bg-white selection:text-black">
      <Head>
        <title>{game.title} | Manifold Store</title>
        <meta name="description" content={game.description} />
        <meta name="theme-color" content="#1D0F3B" />
      </Head>

      <style jsx global>{`
        html,
        body {
          background-color: #1d0f3b !important;
        }
        .markdown-content img {
          border-radius: 1.5rem;
          margin: 2rem 0;
          width: 100%;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .markdown-content h3 {
          font-size: 1.875rem;
          font-weight: 900;
          margin-top: 3rem;
          margin-bottom: 1.5rem;
          color: white;
        }
        .markdown-content h4 {
          font-size: 1.5rem;
          font-weight: 800;
          margin-top: 2.5rem;
          margin-bottom: 1rem;
          color: rgba(255, 255, 255, 0.9);
        }
        .markdown-content p {
          font-size: 1.125rem;
          line-height: 1.8;
          color: rgba(255, 255, 255, 0.7);
          margin-bottom: 1.5rem;
        }
        .markdown-content ul {
          list-style-type: disc;
          padding-left: 1.5rem;
          margin-bottom: 1.5rem;
          color: rgba(255, 255, 255, 0.7);
        }
        .markdown-content li {
          margin-bottom: 0.5rem;
        }
        .markdown-content blockquote {
          border-left: 4px solid #ffb400;
          padding: 1.5rem;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 0 1.5rem 1.5rem 0;
          font-style: italic;
          margin: 2.5rem 0;
        }
        .markdown-content blockquote p {
          margin-bottom: 0;
        }
      `}</style>

      <StoreTopNav games={mockGames} />

      <main className="w-full pt-19">
        {/* Hero Section */}
        <section className="relative w-full max-h-[700px] overflow-hidden">
          <div className="absolute inset-0">
            {game.media.banner && (
              <Image
                src={game.media.banner}
                alt={game.title}
                fill
                className="object-cover opacity-40 blur-sm"
                priority
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#1D0F3B] via-[#1D0F3B]/60 to-transparent" />
          </div>

          <div className="relative h-full max-w-7xl mx-auto px-6 md:px-10 flex flex-col justify-end pb-12">
            <div className="flex flex-col items-start gap-4 md:gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
              <Link
                href="/store"
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm font-bold text-white/60 hover:bg-white/10 hover:text-white transition-all group"
              >
                <ArrowLeft
                  size={16}
                  className="group-hover:-translate-x-1 transition-transform"
                />
                Back to Store
              </Link>

              <div className="flex flex-wrap items-center gap-3">
                {game.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 rounded-lg bg-white/10 backdrop-blur-md text-[10px] md:text-xs font-black tracking-widest uppercase border border-white/10 text-white/90"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <h1 className="text-4xl md:text-6xl lg:text-8xl font-black tracking-tighter leading-none text-white drop-shadow-2xl">
                {game.title}
              </h1>

              <p className="max-w-2xl text-lg md:text-2xl font-medium text-white/80 leading-relaxed drop-shadow-md">
                {game.description}
              </p>

              <ReviewSummary
                positive={game.positive_reviews}
                negative={game.negative_reviews}
              />
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Content Grid */}
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-12 grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Main Content */}
          <div className="lg:col-span-8 flex flex-col gap-12">
            {/* Media Gallery (Stage & Thumbnails) */}
            <MediaGallery
              videos={game.media.videos}
              images={game.media.screenshots}
              gameTitle={game.title}
            />

            <section className="markdown-content">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
              >
                {game.detailed_description}
              </ReactMarkdown>
            </section>
          </div>

          {/* Sidebar */}
          <aside className="lg:col-span-4 flex flex-col gap-8">
            {/* Purchase Card */}
            <div className="p-8 rounded-[2.5rem] bg-white/5 border border-white/10 backdrop-blur-xl sticky top-28 shadow-2xl">
              <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    {!isDemo && game.base_price && (
                      <span className="text-xl font-bold text-white/30 line-through">
                        ${game.base_price}
                      </span>
                    )}
                    <span
                      className="text-4xl md:text-5xl font-black uppercase"
                      style={{
                        color: discountBadgeColor,
                      }}
                    >
                      {isDemo ? "Free" : `$${game.price}`}
                    </span>
                  </div>
                  {!isDemo && game.discount_label && (
                    <DiscountBadge label={game.discount_label} />
                  )}
                </div>

                <button className="w-full py-5 rounded-2xl bg-white text-black text-xl font-black uppercase tracking-wider hover:bg-white/90 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_20px_40px_rgba(255,255,255,0.1)]">
                  {isDemo ? "Play Demo" : "Buy Now"}
                </button>

                {game.social_links.steam_page ? (
                  <a
                    href={game.social_links.steam_page}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-4 rounded-2xl flex items-center justify-center gap-3 border border-[#3b5e78]/50 bg-gradient-to-r from-[#2a475e] to-[#171d24] text-white hover:from-[#3b5e78] hover:to-[#1b2838] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 font-bold uppercase tracking-wider group shadow-[0_10px_30px_rgba(0,0,0,0.3)]"
                  >
                    <IconBrandSteam
                      size={24}
                      className="group-hover:scale-110 transition-transform"
                    />
                    <span>Add to Wishlist</span>
                    <ExternalLink
                      size={16}
                      className="opacity-60 group-hover:opacity-100 transition-opacity"
                    />
                  </a>
                ) : (
                  <button
                    onClick={toggleWishlist}
                    disabled={isToggling}
                    className={`w-full py-4 rounded-2xl flex items-center justify-center gap-3 border transition-all duration-300 font-bold uppercase tracking-wider ${
                      wishlistData?.is_wishlisted
                        ? "bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20"
                        : "bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/20"
                    }`}
                  >
                    <Heart
                      size={20}
                      fill={
                        wishlistData?.is_wishlisted ? "currentColor" : "none"
                      }
                      className={isToggling ? "opacity-50" : ""}
                    />
                    {wishlistData?.is_wishlisted
                      ? "On Wishlist"
                      : "Add to Wishlist"}
                  </button>
                )}

                <div className="h-px bg-white/10" />

                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/40 font-bold uppercase tracking-widest">
                      Developer
                    </span>
                    <span className="text-white font-black">
                      {game.developer_name}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/40 font-bold uppercase tracking-widest">
                      Release Date
                    </span>
                    <span className="text-white font-black">
                      {new Date(game.launch_date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <h4 className="text-xs font-black uppercase tracking-widest text-white/30 mb-1">
                    Features
                  </h4>
                  <div className="grid grid-cols-1 gap-2">
                    <MetaTag icon={User} label="Single Player" active={true} />
                    <MetaTag icon={Users} label="Multiplayer" active={false} />
                    <MetaTag
                      icon={Gamepad2}
                      label="Controller Support"
                      active={true}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <h4 className="text-xs font-black uppercase tracking-widest text-white/30 mb-1">
                    Stay Connected
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <SocialLink
                      icon={IconBrandX}
                      href={game.social_links.twitter}
                      label="X"
                    />
                    <SocialLink
                      icon={IconBrandSteam}
                      href={game.social_links.steam_page}
                      label="Steam"
                    />
                    <SocialLink
                      icon={MessageSquare}
                      href={game.social_links.discord}
                      label="Discord"
                    />
                    <SocialLink
                      icon={Globe}
                      href={game.social_links.website}
                      label="Website"
                    />
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* Reviews Section */}
        <SectionDivider />
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-12">
          <div className="flex flex-col gap-12">
            <header className="flex flex-col gap-4">
              <h2 className="text-4xl md:text-5xl font-black flex items-center gap-4 tracking-tighter">
                <MessageSquare className="text-indigo-400" />
                Community Intel
              </h2>
              <p className="text-white/40 font-bold max-w-xl">
                Real-time field reports from players across the astral network.
                Verified accounts only.
              </p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Reviews are empty for now as they are not in GameApi yet */}
              <div className="col-span-full py-12 flex flex-col items-center gap-4 bg-white/5 rounded-[2.5rem] border border-white/5 opacity-50">
                <MessageSquare size={48} strokeWidth={1} />
                <p className="font-bold">
                  No intel available for this sector yet.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <StoreFooter />
    </div>
  );
}
