import { ReactNode, useEffect } from "react";
import { useRouter } from "next/router";
import useSWR from "swr";
import { BackofficeTopNav } from "./BackofficeTopNav";

interface BackofficeUser {
  id: string;
  username: string;
  email: string;
  features: string[];
}

const fetcher = (url: string) =>
  fetch(url).then(async (res) => {
    if (!res.ok) throw new Error("Not logged in");
    return res.json();
  });

// Any admin has read:dashboard:any (part of ADMIN_ONLY_FEATURES, granted as
// a whole - see models/authorization.ts). Cheap enough as a client-side
// "am I an admin" signal; the actual gate is server-side on every route.
const ADMIN_SIGNAL_FEATURE = "read:dashboard:any";

export function useBackofficeAccess() {
  const { data, error, isLoading } = useSWR<BackofficeUser>(
    "/api/v1/user",
    fetcher,
    { shouldRetryOnError: false },
  );

  const isLoggedOut = !!error;
  const isAdmin = !!data?.features?.includes(ADMIN_SIGNAL_FEATURE);

  return { user: data, isLoading, isLoggedOut, isAdmin };
}

export function BackofficeLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, isLoading, isLoggedOut, isAdmin } = useBackofficeAccess();

  useEffect(() => {
    if (isLoading) return;

    if (isLoggedOut) {
      router.replace(`/login?callbackUrl=${encodeURIComponent(router.asPath)}`);
      return;
    }

    if (!isAdmin) {
      router.replace("/store");
    }
  }, [isLoading, isLoggedOut, isAdmin, router]);

  if (isLoading || isLoggedOut || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b0812]">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/10 border-t-violet-300" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0812] text-white lg:pl-60">
      <BackofficeTopNav username={user.username} />
      <main className="mx-auto max-w-[1500px] px-4 pb-16 pt-36 sm:px-6 lg:px-10 lg:pt-10">
        <div className="rounded-xl border border-white/[0.07] bg-[#100c17] p-5 sm:p-7 lg:p-9">
          {children}
        </div>
      </main>
    </div>
  );
}
