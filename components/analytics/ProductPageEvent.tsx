import { useEffect, useRef } from "react";
import { useRouter } from "next/router";
import type { ClientEventInput } from "contracts/product-events";
import { productEventsClient } from "lib/product-events-client";

// Mounted only with successfully rendered public data. No route-wide tracking of private pages.
export function ProductPageEvent({
  event,
  preview = false,
}: {
  event: ClientEventInput;
  preview?: boolean;
}) {
  const router = useRouter();
  const serialized = JSON.stringify(event);
  const occurrence = useRef<{ key: string; id: string } | null>(null);
  useEffect(() => {
    if (preview || router.query.preview || router.query.social_preview) return;
    const client = productEventsClient();
    if (!client) return;
    const key = router.asPath + ":" + serialized;
    if (occurrence.current?.key !== key)
      occurrence.current = { key, id: crypto.randomUUID() };
    const id = occurrence.current.id;
    let active = true;
    async function observe() {
      if (document.visibilityState !== "visible") return;
      if (
        (await client!.ready()) &&
        active &&
        document.visibilityState === "visible"
      ) {
        client!.capturePage(JSON.parse(serialized), id);
      }
    }
    void observe();
    const unsubscribe = client.subscribe(() => {
      void observe();
    });
    document.addEventListener("visibilitychange", observe);
    return () => {
      active = false;
      unsubscribe();
      document.removeEventListener("visibilitychange", observe);
    };
  }, [
    preview,
    router.asPath,
    router.query.preview,
    router.query.social_preview,
    serialized,
  ]);
  return null;
}
