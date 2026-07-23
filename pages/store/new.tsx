import { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import useSWR from "swr";
import { Loader2 } from "lucide-react";

interface CurrentUser {
  id: string;
  username: string;
}

const userFetcher = (url: string) =>
  fetch(url).then(async (res) => {
    if (!res.ok) throw new Error("Not logged in");
    return res.json();
  });

export default function StoreCreatePage() {
  const router = useRouter();

  const { error: userError, isLoading: isUserLoading } = useSWR<CurrentUser>(
    "/api/v1/user",
    userFetcher,
    { shouldRetryOnError: false },
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isLoggedOut = !!userError;

  if (!isUserLoading && isLoggedOut) {
    router.replace(`/login?callbackUrl=${encodeURIComponent(router.asPath)}`);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/v1/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description.trim() || undefined,
          logo_url: logoUrl.trim() || undefined,
        }),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setFormError(body?.message || "Failed to create outlet.");
        return;
      }

      router.push(`/store/${body.slug}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>Create Your Outlet | Manifold</title>
      </Head>

      <div className="min-h-screen bg-[#1D0F3B] text-white flex items-center justify-center px-4">
        <div className="w-full max-w-md flex flex-col gap-6">
          <div>
            <h1 className="text-2xl font-black">Create Your Outlet</h1>
            <p className="text-white/50 text-sm font-bold mt-1">
              An Outlet is your own curated storefront on Manifold.
            </p>
          </div>

          {isUserLoading ? (
            <Loader2 className="animate-spin text-white/30" />
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-white/40">
                  Outlet name
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Pixel Arcade"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white placeholder:text-white/30 outline-none focus:bg-white/10 focus:border-white/20"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-white/40">
                  Description (optional)
                </span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Tell players what your outlet is about."
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white placeholder:text-white/30 outline-none focus:bg-white/10 focus:border-white/20 resize-none"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-white/40">
                  Logo URL (optional)
                </span>
                <input
                  type="text"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white placeholder:text-white/30 outline-none focus:bg-white/10 focus:border-white/20"
                />
              </label>

              <p className="text-xs font-bold text-white/40">
                Your outlet shows the full Manifold catalog by default. You can
                curate what it shows after creating it.
              </p>

              {formError && (
                <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm font-bold">
                  {formError}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !name.trim()}
                className="px-4 py-3 rounded-xl bg-emerald-500 text-black font-black text-sm uppercase tracking-wider hover:bg-emerald-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Creating..." : "Create Outlet"}
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
