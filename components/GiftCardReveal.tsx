import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "lib/i18n";

export function GiftCardReveal({
  orderId,
  onRevealed,
}: {
  orderId: string;
  onRevealed: () => Promise<unknown>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/v1/gift-card-orders/${orderId}/reveal`,
        {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: true }),
        },
      );
      if (!response.ok) throw new Error("Disclosure failed");
      const result = await response.json();
      setCode(result.gift_card_code);
      setOpen(false);
      // The code belongs only to this mounted component, never to SWR,
      // storage, URL, a listing payload, or a server-rendered prop.
      await onRevealed().catch(() => undefined);
    } catch {
      setError(t("The gift card could not be revealed. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <p className="text-sm text-amber-200">
        {t(
          "Revealing the code records disclosure and may affect refund eligibility. Applicable exceptions still apply.",
        )}
      </p>
      {code ? (
        <p
          className="mt-3 break-all rounded-lg bg-white/5 p-4 font-mono text-xs"
          aria-label={t("Demo gift card code")}
        >
          {code}
        </p>
      ) : (
        <button
          type="button"
          className="mt-3 rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold"
          onClick={() => setOpen(true)}
        >
          {t("Reveal code")}
        </button>
      )}
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onCancel={() => setOpen(false)}
        className="max-w-lg rounded-xl border border-white/20 bg-[#14101c] p-6 text-white backdrop:bg-black/70"
      >
        <h3 id={titleId} className="text-lg font-bold">
          {t("Confirm code disclosure")}
        </h3>
        <p className="mt-3 text-sm">
          {t(
            "Confirming will reveal the code and record this disclosure. This may affect refund eligibility, subject to applicable exceptions.",
          )}
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-amber-200">
            {error}
          </p>
        )}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            autoFocus
            disabled={busy}
            onClick={() => setOpen(false)}
            className="rounded-lg border border-white/20 px-4 py-2"
          >
            {t("Cancel")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={confirm}
            className="rounded-lg bg-violet-600 px-4 py-2"
          >
            {t("Confirm and reveal")}
          </button>
        </div>
      </dialog>
    </div>
  );
}
