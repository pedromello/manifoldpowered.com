import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "lib/i18n";
import { Check, Copy, Eye, Loader2, ShieldCheck } from "lucide-react";

export function GiftCardReveal({
  orderId,
  onRevealed,
  firstRevealedAt = null,
}: {
  orderId: string;
  onRevealed: () => Promise<unknown>;
  firstRevealedAt?: string | null;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
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
      setError(t("We could not show your code. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {code ? (
        <div className="rounded-xl border border-violet-400/25 bg-violet-400/5 p-4">
          <p className="text-xs font-medium text-white/50">
            {t("Gift card code")}
          </p>
          <p
            className="mt-2 break-all font-mono text-sm leading-6 text-violet-100"
            aria-label={t("Gift card code")}
          >
            {code}
          </p>
          <button
            type="button"
            className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/15 px-3 text-xs font-semibold transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code);
                setCopied(true);
                setCopyError(false);
              } catch {
                setCopyError(true);
              }
            }}
          >
            {copied ? (
              <Check size={14} aria-hidden="true" />
            ) : (
              <Copy size={14} aria-hidden="true" />
            )}
            {t(copied ? "Code copied" : "Copy code")}
          </button>
          {copyError && (
            <p role="alert" className="mt-2 text-xs text-amber-200">
              {t("Could not copy. Select the code to copy it manually.")}
            </p>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          aria-busy={busy}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-violet-600 px-5 text-sm font-semibold transition-colors hover:bg-violet-500 active:bg-violet-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 disabled:cursor-wait disabled:opacity-60"
          onClick={() => {
            setError("");
            if (firstRevealedAt) return confirm();
            setOpen(true);
          }}
        >
          {busy ? (
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <Eye size={16} aria-hidden="true" />
          )}
          {t(
            busy
              ? "Loading code"
              : firstRevealedAt
                ? "View code"
                : "Reveal code",
          )}
        </button>
      )}
      {error && !open && (
        <p role="alert" className="mt-3 text-sm text-amber-200">
          {error}
        </p>
      )}
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onCancel={(event) => {
          if (busy) event.preventDefault();
          else setOpen(false);
        }}
        onClose={() => setOpen(false)}
        className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-white/15 bg-[#191421] p-6 text-white shadow-2xl backdrop:bg-black/75 backdrop:backdrop-blur-sm sm:p-8"
      >
        <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-violet-400/10 text-violet-300">
          <ShieldCheck size={24} aria-hidden="true" />
        </div>
        <h3 id={titleId} className="text-lg font-bold">
          {t("Reveal your code?")}
        </h3>
        <p id={descriptionId} className="mt-3 text-sm leading-6 text-white/65">
          {t(
            "Revealing the code may limit refund options, subject to applicable conditions.",
          )}
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-amber-200">
            {error}
          </p>
        )}
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row">
          <button
            type="button"
            autoFocus
            disabled={busy}
            onClick={() => setOpen(false)}
            className="min-h-11 rounded-lg border border-white/15 px-4 text-sm font-semibold transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 disabled:cursor-wait disabled:opacity-40"
          >
            {t("Cancel")}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={confirm}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-semibold transition-colors hover:bg-violet-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300 disabled:cursor-wait disabled:opacity-40"
          >
            {busy && (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            )}
            {t("Reveal code")}
          </button>
        </div>
      </dialog>
    </div>
  );
}
