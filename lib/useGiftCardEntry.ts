import { useEffect, useRef } from "react";

// Exactly one attempt per detail entry, even with React Strict Mode or a
// revalidation. Leaving and entering again permits another attempt; the DB
// separately enforces cooldown and serialization across tabs/processes.
export function useGiftCardEntry(
  id: string | null,
  loadedId: string | undefined,
  pending: boolean,
  reconcile: (id: string) => Promise<unknown>,
) {
  const entry = useRef<{ id: string | null; attempted: boolean }>({
    id: null,
    attempted: false,
  });
  useEffect(() => {
    if (entry.current.id !== id) entry.current = { id, attempted: false };
    if (!id || loadedId !== id || entry.current.attempted) return;
    entry.current.attempted = true;
    if (pending) void reconcile(id);
  }, [id, loadedId, pending, reconcile]);
}
