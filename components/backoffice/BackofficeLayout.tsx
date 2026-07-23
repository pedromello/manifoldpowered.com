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
      <div className="min-h-screen bg-[#1D0F3B] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-white/20" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1D0F3B] text-white">
      <BackofficeTopNav username={user.username} />
      <main className="pt-32 md:pt-24 pb-16 px-4 md:px-10 max-w-7xl mx-auto">
        {children}
      </main>
    </div>
  );
}
