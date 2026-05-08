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
  Heart,
  CheckCircle2,
  X,
  PenLine,
  Loader2,
  Send,
} from "lucide-react";

import useSWR from "swr";
import { useState } from "react";
import { useRouter } from "next/router";

import { IconBrandX, IconBrandSteam } from "@tabler/icons-react";

import { StoreLayout } from "components/store/StoreLayout";
import { DiscountBadge } from "components/store/DiscountBadge";
import { SectionDivider } from "components/store/SectionDivider";
import { MediaGallery } from "components/store/MediaGallery";
import { discountBadgeColor } from "components/store/constants";
import { MetaTag } from "components/store/MetaTag";
import { SocialLink } from "components/store/SocialLink";
import {
  ReviewCard,
  Review,
  ReviewsApiResponse,
} from "components/store/ReviewCard";
import { ReviewSummary } from "components/store/ReviewSummary";
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
  review_score: string;
};

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
  const router = useRouter();

  const {
    data: libraryData,
    error: libraryError,
    mutate: mutateLibrary,
  } = useSWR(
    "/api/v1/library",
    (url) =>
      fetch(url).then((res) => {
        if (!res.ok) throw new Error("Not logged in");
        return res.json();
      }),
    { shouldRetryOnError: false },
  );

  const {
    data: reviewsData,
    mutate: mutateReviews,
    isValidating: isReviewsLoading,
  } = useSWR<ReviewsApiResponse>(
    game ? `/api/v1/reviews?slug=${game.slug}&page=1&limit=10` : null,
    (url) => fetch(url).then((res) => res.json()),
  );

  const isLoggedOut = !!libraryError;
  const isInLibrary =
    libraryData?.games?.some(
      (item: { game: { slug: string } }) => item.game.slug === game.slug,
    ) || false;

  const [isRedeeming, setIsRedeeming] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    message: "",
    recommended: true,
  });
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeletingReview, setIsDeletingReview] = useState(false);

  const handleDeleteReview = async () => {
    setIsDeletingReview(true);
    try {
      const res = await fetch("/api/v1/reviews", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: game.slug }),
      });
      if (!res.ok) throw new Error("Failed to delete review");
      await mutateReviews();
      setShowDeleteModal(false);
    } catch (error) {
      console.error(error);
      alert("Failed to delete review.");
    } finally {
      setIsDeletingReview(false);
    }
  };

  const handlePostReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewForm.message.trim()) return;

    setIsSubmittingReview(true);
    try {
      const res = await fetch("/api/v1/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: game.slug,
          message: reviewForm.message,
          recommended: reviewForm.recommended,
        }),
      });

      if (!res.ok) throw new Error("Failed to post review");

      await mutateReviews();
      setShowReviewModal(false);
      setReviewForm({ message: "", recommended: true });
    } catch (error) {
      console.error(error);
      alert("Failed to submit review.");
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleRedeem = async () => {
    if (isLoggedOut) {
      router.push(`/login?callbackUrl=/item/${game.slug}`);
      return;
    }

    if (isInLibrary || isRedeeming) return;

    setIsRedeeming(true);
    try {
      const res = await fetch("/api/v1/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: game.slug }),
      });

      if (!res.ok) throw new Error("Failed to redeem");

      mutateLibrary();
      setShowSuccessModal(true);
      setIsRedeeming(false);
    } catch (error) {
      console.error(error);
      setIsRedeeming(false);
    }
  };

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
                reviewScore={game.review_score}
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

                {isInLibrary ? (
                  <button
                    onClick={() => router.push("/library")}
                    className="w-full py-5 rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 text-xl font-black uppercase tracking-wider hover:bg-indigo-500/30 cursor-pointer transition-all shadow-[0_20px_40px_rgba(99,102,241,0.1)]"
                  >
                    In Library
                  </button>
                ) : (
                  <button
                    onClick={handleRedeem}
                    disabled={isRedeeming}
                    className="w-full py-5 rounded-2xl bg-white text-black text-xl font-black uppercase tracking-wider hover:bg-white/90 hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed transition-all shadow-[0_20px_40px_rgba(255,255,255,0.1)] disabled:opacity-70 disabled:hover:scale-100"
                  >
                    {isRedeeming
                      ? "Redeeming..."
                      : isDemo
                        ? "Redeem Demo"
                        : "Redeem"}
                  </button>
                )}

                {game.social_links.steam_page ? (
                  <a
                    href={game.social_links.steam_page}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-4 rounded-2xl flex items-center justify-center gap-3 border border-[#3b5e78]/50 bg-gradient-to-r from-[#2a475e] to-[#171d24] text-white hover:from-[#3b5e78] hover:to-[#1b2838] hover:scale-[1.02] active:scale-[0.98] cursor-pointer transition-all duration-300 font-bold uppercase tracking-wider group shadow-[0_10px_30px_rgba(0,0,0,0.3)]"
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
                    className={`w-full py-4 rounded-2xl flex items-center justify-center gap-3 border transition-all duration-300 font-bold uppercase tracking-wider cursor-pointer disabled:cursor-not-allowed ${
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
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="flex flex-col gap-4">
                <h2 className="text-4xl md:text-5xl font-black flex items-center gap-4 tracking-tighter">
                  <MessageSquare className="text-indigo-400" />
                  Reviews
                </h2>
                <p className="text-white/40 font-bold max-w-xl">
                  Real-time field reports from players across the astral
                  network. Verified accounts only.
                </p>
              </div>

              {isInLibrary && !reviewsData?.user_review && (
                <button
                  onClick={() => setShowReviewModal(true)}
                  className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white text-white hover:text-black transition-all font-black tracking-wider uppercase border border-white/20 flex items-center gap-2 group"
                >
                  <PenLine
                    size={18}
                    className="group-hover:scale-110 transition-transform"
                  />
                  Write a Review
                </button>
              )}

              {isInLibrary && reviewsData?.user_review && (
                <div className="px-6 py-3 rounded-xl bg-white/5 text-white/40 font-bold uppercase tracking-wider border border-white/10 flex items-center gap-2">
                  <CheckCircle2 size={18} className="text-emerald-500/50" />
                  Reviewed
                </div>
              )}
            </header>

            {reviewsData?.user_review && (
              <div className="flex flex-col gap-4 mb-8">
                <h3 className="text-xl font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                  <User size={20} />
                  Your Report
                </h3>
                <div className="max-w-2xl">
                  <ReviewCard
                    key={reviewsData.user_review.id}
                    review={reviewsData.user_review}
                    isOwn={true}
                    onDelete={() => setShowDeleteModal(true)}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {!reviewsData && isReviewsLoading && (
                <div className="col-span-full py-12 flex items-center justify-center">
                  <Loader2 size={32} className="animate-spin text-white/50" />
                </div>
              )}

              {reviewsData?.reviews?.length > 0 || reviewsData?.user_review ? (
                reviewsData.reviews
                  .filter(
                    (review) => review.id !== reviewsData?.user_review?.id,
                  )
                  .map((review) => (
                    <ReviewCard key={review.id} review={review} />
                  ))
              ) : (
                <div className="col-span-full py-12 flex flex-col items-center gap-4 bg-white/5 rounded-[2.5rem] border border-white/5 opacity-50">
                  <MessageSquare size={48} strokeWidth={1} />
                  <p className="font-bold">
                    No reviews available for this game yet. Be the first to
                    deploy a report!
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="relative w-full max-w-md bg-[#1D0F3B] border border-white/20 rounded-3xl shadow-2xl p-8 flex flex-col items-center text-center animate-in zoom-in-95 duration-300">
            <button
              onClick={() => setShowSuccessModal(false)}
              className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>

            <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 size={48} className="text-emerald-400" />
            </div>

            <h2 className="text-2xl font-black text-white mb-4">
              Game Redeemed!
            </h2>

            <p className="text-white/60 mb-8">
              Successfully added{" "}
              <span className="text-white font-bold">{game.title}</span> to your
              library. You can now download and play it from your personal
              collection.
            </p>

            <div className="flex flex-col w-full gap-3">
              <Link
                href="/library"
                className="w-full py-4 rounded-xl bg-white text-black font-black uppercase tracking-wider hover:scale-[1.02] transition-transform"
              >
                Go to Library
              </Link>
              <button
                onClick={() => setShowSuccessModal(false)}
                className="w-full py-4 rounded-xl border border-white/10 text-white font-bold uppercase hover:bg-white/5 transition-colors"
              >
                Continue Browsing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review Submission Modal (Glassmorphism) */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="relative w-full max-w-xl bg-white/5 border border-white/10 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-3xl animate-in zoom-in-95 duration-300">
            <div className="p-8">
              <button
                onClick={() => setShowReviewModal(false)}
                className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>

              <h2 className="text-3xl font-black tracking-tighter mb-2">
                Write a Review
              </h2>
              <p className="text-white/50 mb-8 font-medium">
                Share your intel on{" "}
                <span className="text-white font-bold">{game.title}</span> with
                the community.
              </p>

              <form onSubmit={handlePostReview} className="flex flex-col gap-6">
                {/* Recommendation Toggle */}
                <div className="flex gap-4 p-1 bg-white/5 rounded-2xl border border-white/10">
                  <button
                    type="button"
                    onClick={() =>
                      setReviewForm((prev) => ({ ...prev, recommended: true }))
                    }
                    className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-xl font-bold uppercase tracking-wider transition-all duration-300 ${
                      reviewForm.recommended
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_20px_rgba(52,211,153,0.1)]"
                        : "text-white/40 hover:text-white/80 hover:bg-white/5"
                    }`}
                  >
                    <ThumbsUp size={18} />
                    Recommended
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setReviewForm((prev) => ({ ...prev, recommended: false }))
                    }
                    className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-xl font-bold uppercase tracking-wider transition-all duration-300 ${
                      !reviewForm.recommended
                        ? "bg-rose-500/20 text-rose-400 border border-rose-500/30 shadow-[0_0_20px_rgba(251,113,133,0.1)]"
                        : "text-white/40 hover:text-white/80 hover:bg-white/5"
                    }`}
                  >
                    <ThumbsDown size={18} />
                    Not Recommended
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="review-message"
                    className="text-xs font-black uppercase tracking-widest text-white/40"
                  >
                    Your Report
                  </label>
                  <textarea
                    id="review-message"
                    required
                    value={reviewForm.message}
                    onChange={(e) =>
                      setReviewForm((prev) => ({
                        ...prev,
                        message: e.target.value,
                      }))
                    }
                    placeholder="What did you think of the game?"
                    className="w-full bg-black/20 border border-white/10 rounded-2xl p-4 text-white placeholder:text-white/20 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 resize-none h-40 transition-all font-medium"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingReview || !reviewForm.message.trim()}
                  className="w-full py-5 mt-2 rounded-2xl bg-white text-black font-black uppercase tracking-wider hover:bg-white/90 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
                >
                  {isSubmittingReview ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      Transmitting...
                    </>
                  ) : (
                    <>
                      <Send size={20} />
                      Post Review
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="relative w-full max-w-md bg-[#1D0F3B] border border-white/20 rounded-3xl shadow-2xl p-8 flex flex-col items-center text-center animate-in zoom-in-95 duration-300">
            <h2 className="text-2xl font-black text-white mb-4">
              Delete Review?
            </h2>
            <p className="text-white/60 mb-8">
              Are you sure you want to delete your review? This action cannot be
              undone.
            </p>
            <div className="flex flex-col w-full gap-3">
              <button
                onClick={handleDeleteReview}
                disabled={isDeletingReview}
                className="w-full py-4 rounded-xl bg-rose-500 text-white font-black uppercase tracking-wider hover:bg-rose-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeletingReview ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  "Delete Review"
                )}
              </button>
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeletingReview}
                className="w-full py-4 rounded-xl border border-white/10 text-white font-bold uppercase hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

GameDetailsPage.getLayout = function getLayout(page: React.ReactElement) {
  return <StoreLayout>{page}</StoreLayout>;
};
