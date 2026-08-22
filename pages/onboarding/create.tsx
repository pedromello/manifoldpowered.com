import { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import useSWR from "swr";
import { Loader2 } from "lucide-react";
import { CreatorWorkspaceLayout } from "components/creator/CreatorWorkspaceLayout";
import { StudioValueProp } from "components/onboarding/StudioValueProp";

interface CurrentUser {
  id: string;
  username: string;
}

const userFetcher = (url: string) =>
  fetch(url).then(async (res) => {
    if (!res.ok) throw new Error("Not logged in");
    return res.json();
  });

export default function OnboardingCreatePage() {
  const router = useRouter();

  const { error: userError, isLoading: isUserLoading } = useSWR<CurrentUser>(
    "/api/v1/user",
    userFetcher,
    { shouldRetryOnError: false },
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [isPublisher, setIsPublisher] = useState(false);
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
      const response = await fetch("/api/v1/studios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description.trim() || undefined,
          logo_url: logoUrl.trim() || undefined,
          is_publisher: isPublisher,
        }),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        setFormError(body?.message || "Failed to create studio.");
        return;
      }

      router.push(`/studio/${body.slug}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>Create Your Studio | Manifold</title>
      </Head>

      <div className="min-h-[calc(100vh-4rem)] bg-[#0b0812] px-4 py-10 text-white sm:px-6 lg:px-10 lg:py-14">
        <div className="mx-auto grid w-full max-w-5xl items-start gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
          <div className="lg:pt-4">
            <StudioValueProp />
          </div>

          <div className="flex w-full flex-col gap-6 rounded-xl border border-white/[0.08] bg-[#14101c] p-6 shadow-2xl shadow-black/20 sm:p-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-300">
                Developer profile
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-tight">
                Create your Studio
              </h1>
            </div>

            {isUserLoading ? (
              <Loader2 className="animate-spin text-white/30" />
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-white/40">
                    Studio name
                  </span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Hibernian Workshop"
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
                    placeholder="Tell players what your studio makes."
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

                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isPublisher}
                    onChange={(e) => setIsPublisher(e.target.checked)}
                    className="mt-1"
                  />
                  <span className="text-sm font-bold text-white/70">
                    This studio also publishes other studios&apos; games
                    <span className="block text-xs font-normal text-white/40 mt-0.5">
                      You can change this later.
                    </span>
                  </span>
                </label>

                {formError && (
                  <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm font-bold">
                    {formError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || !name.trim()}
                  className="rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-3 text-sm font-black uppercase tracking-wider text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isSubmitting ? "Creating..." : "Create Studio"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

OnboardingCreatePage.getLayout = function getLayout(page: React.ReactElement) {
  return <CreatorWorkspaceLayout>{page}</CreatorWorkspaceLayout>;
};
