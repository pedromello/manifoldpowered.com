import useSWR from "swr";

export function usePurchaseAvailability() {
  const { data } = useSWR<{
    purchases_enabled: boolean;
    gift_cards_enabled: boolean;
  }>(
    "/api/v1/runtime",
    async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Purchases are unavailable.");
      return response.json();
    },
    { shouldRetryOnError: false, revalidateOnFocus: false },
  );
  const local = process.env.NODE_ENV !== "production";
  return {
    purchasesEnabled: data?.purchases_enabled ?? local,
    giftCardsEnabled: data?.gift_cards_enabled ?? local,
  };
}
