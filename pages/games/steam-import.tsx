import { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import useSWR from "swr";
import { Loader2 } from "lucide-react";
import { extractSteamAppId } from "lib/steam";

interface CurrentUser {
  id: string;
  username: string;
}

const userFetcher = (url: string) =>
  fetch(url).then(async (res) => {
    if (!res.ok) throw new Error("Not logged in");
    return res.json();
  });

export default function CommunitySteamImportPage() {
  const router = useRouter();
  const { error: userError, isLoading } = useSWR<CurrentUser>(
    "/api/v1/user",
    userFetcher,
    { shouldRetryOnError: false },
  );
  const [input, setInput] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isLoading && userError) {
    router.replace(`/login?callbackUrl=${encodeURIComponent(router.asPath)}`);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    const steamAppId = extractSteamAppId(input);
    if (!steamAppId) {
      setFormError(
        "Enter a valid Steam store link (e.g. https://store.steampowered.com/app/400/) or a numeric App ID.",
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/v1/items/games/steam-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steam_app_id: steamAppId }),
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setFormError(body?.message || "Failed to import game from Steam.");
        return;
      }

      router.push(`/item/${body.slug}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>Import from Steam | Manifold</title>
      </Head>
      <div className="min-h-screen bg-[#1D0F3B] text-white flex items-center justify-center px-4">
        <div className="w-full max-w-md flex flex-col gap-6">
          <div>
            <h1 className="text-2xl font-black">Add a game from Steam</h1>
            <p className="text-white/50 text-sm font-bold mt-1">
              It will join the public catalog as an unclaimed game. Importing it
              does not give you ownership.
            </p>
          </div>

          {isLoading ? (
            <Loader2 className="animate-spin text-white/30" />
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-white/40">
                  Steam store link or App ID
                </span>
                <input
                  type="text"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="https://store.steampowered.com/app/400/Portal/"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white placeholder:text-white/30 outline-none focus:bg-white/10 focus:border-white/20"
                />
              </label>

              {formError && (
                <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm font-bold">
                  {formError}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !input.trim()}
                className="px-4 py-3 rounded-xl bg-emerald-500 text-black font-black text-sm uppercase tracking-wider hover:bg-emerald-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Importing..." : "Add to catalog"}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
