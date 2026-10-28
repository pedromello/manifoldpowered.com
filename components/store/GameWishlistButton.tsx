import { useState } from "react";
import { useRouter } from "next/router";
import useSWR from "swr";
import { Heart } from "lucide-react";
import { useI18n } from "lib/i18n";
import { selectionRequest } from "lib/selection-client";

export function GameWishlistButton({ slug }: { slug: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const key = `/api/v1/wishlists?slug=${encodeURIComponent(slug)}`;
  const {
    data,
    error: loadError,
    mutate,
  } = useSWR<{ is_wishlisted: boolean; count?: number }>(key, selectionRequest);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function toggle() {
    if (pending || !data) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/wishlists", {
        method: data.is_wishlisted ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      if (response.status === 401 || response.status === 403) {
        void router.push(
          `/login?callbackUrl=${encodeURIComponent(router.asPath)}`,
        );
        return;
      }
      if (!response.ok) {
        throw new Error("Could not save this game. Please try again.");
      }
      await mutate(
        {
          ...data,
          is_wishlisted: !data.is_wishlisted,
          ...(typeof data.count === "number"
            ? { count: Math.max(0, data.count + (data.is_wishlisted ? -1 : 1)) }
            : {}),
        },
        { revalidate: false },
      );
      void mutate().catch(() => undefined);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not save this game. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        disabled={pending || !data}
        aria-pressed={data?.is_wishlisted ?? false}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 bg-black/40 px-4 text-sm font-semibold text-white focus-visible:ring-2 focus-visible:ring-violet-400 disabled:opacity-50"
      >
        <Heart
          size={17}
          fill={data?.is_wishlisted ? "currentColor" : "none"}
          aria-hidden="true"
        />
        {t(data?.is_wishlisted ? "On Wishlist" : "Save game")}
      </button>
      {error && (
        <p role="alert" className="mt-2 max-w-xs text-xs text-rose-200">
          {t(error)}
        </p>
      )}
      {loadError && (
        <p role="alert" className="mt-2 text-xs text-rose-200">
          <button
            type="button"
            onClick={() => void mutate().catch(() => undefined)}
            className="underline"
          >
            {t("Retry wishlist status")}
          </button>
        </p>
      )}
    </div>
  );
}
