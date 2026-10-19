import type {
  ClientEventInput,
  ClientProductEvent,
} from "contracts/product-events";
import {
  EVENT_BATCH_SIZE,
  EVENT_CONTEXT_HEADER,
} from "contracts/product-event-constants";

type Pending = {
  event: ClientProductEvent;
  generation: string;
  attempt: number;
};
type Runtime = {
  fetch: typeof fetch;
  now: () => number;
  uuid: () => string;
  schedule: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  cancel: (timer: ReturnType<typeof setTimeout>) => void;
};
export function createProductEventsClient(runtime: Runtime) {
  let generation: string | null = null;
  let booting: Promise<boolean> | null = null;
  let sending = false;
  let inFlightCount = 0;
  let queue: Pending[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cooldown = 0;
  let epoch = 0;
  let recognizedAt = 0;
  const listeners = new Set<() => void>();
  const pageIds = new Set<string>();
  function schedule(ms = 2000) {
    if (timer) runtime.cancel(timer);
    timer = runtime.schedule(() => {
      timer = undefined;
      void flush();
    }, ms);
  }
  function reset() {
    epoch++;
    generation = null;
    queue = [];
    if (timer) runtime.cancel(timer);
    timer = undefined;
  }
  async function ready(): Promise<boolean> {
    if (generation && runtime.now() - recognizedAt < 60_000) return true;
    if (runtime.now() < cooldown) return false;
    if (booting) return booting;
    const startEpoch = epoch;
    booting = (async () => {
      try {
        const response = await runtime.fetch("/api/v1/events", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "bootstrap" }),
        });
        if (!response.ok) {
          cooldown = runtime.now() + 60_000;
          return false;
        }
        const data = await response.json();
        if (startEpoch !== epoch || typeof data.generation !== "string")
          return false;
        const changed = generation !== data.generation;
        if (changed) {
          epoch++;
          queue = [];
        }
        generation = data.generation;
        recognizedAt = runtime.now();
        if (changed) for (const listener of listeners) listener();
        return true;
      } catch {
        cooldown = runtime.now() + 60_000;
        return false;
      } finally {
        booting = null;
      }
    })();
    return booting;
  }
  function capture(input: ClientEventInput, id = runtime.uuid()) {
    // No attribution of occurrences collected before a recognized server context.
    if (!generation || queue.length + inFlightCount >= 50) return false;
    queue.push({
      event: {
        ...input,
        id,
        schema_version: 1,
        client_occurred_at: new Date(runtime.now()).toISOString(),
      } as ClientProductEvent,
      generation,
      attempt: 0,
    });
    if (queue.length >= EVENT_BATCH_SIZE) void flush();
    else schedule();
    return true;
  }
  function capturePage(input: ClientEventInput, id: string) {
    const pageKey = generation + ":" + id;
    if (pageIds.has(pageKey)) return;
    if (capture(input)) {
      pageIds.add(pageKey);
      if (pageIds.size > 100) pageIds.delete(pageIds.values().next().value!);
    }
  }
  async function flush() {
    if (sending || !queue.length) return;
    if (runtime.now() < cooldown) {
      schedule(cooldown - runtime.now());
      return;
    }
    sending = true;
    const batch = queue.splice(0, EVENT_BATCH_SIZE);
    inFlightCount = batch.length;
    const capturedGeneration = batch[0].generation;
    const startEpoch = epoch;
    try {
      const response = await runtime.fetch("/api/v1/events", {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "events",
          context_generation: capturedGeneration,
          events: batch.map((p) => p.event),
        }),
      });
      if (startEpoch !== epoch) return;
      if (response.status === 409) {
        reset();
        void ready();
        return;
      }
      if (response.status === 429 || response.status >= 500) {
        const seconds = Number(response.headers.get("Retry-After"));
        cooldown =
          runtime.now() +
          (response.status === 429
            ? Math.min(60_000, Math.max(1000, seconds * 1000 || 1000))
            : 2000);
        retry(batch);
      }
    } catch {
      if (startEpoch === epoch) {
        cooldown = runtime.now() + 2000;
        retry(batch);
      }
    } finally {
      sending = false;
      inFlightCount = 0;
      if (queue.length) schedule(Math.max(0, cooldown - runtime.now()) || 2000);
    }
  }
  function retry(batch: Pending[]) {
    const once = batch
      .filter((p) => p.attempt === 0 && p.generation === generation)
      .map((p) => ({ ...p, attempt: 1 }));
    queue = [...once, ...queue].slice(0, 50);
  }
  function recognize(value: string) {
    reset();
    generation = value;
    recognizedAt = runtime.now();
    for (const listener of listeners) listener();
  }
  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
  return { ready, capture, capturePage, flush, reset, recognize, subscribe };
}

let singleton: ReturnType<typeof createProductEventsClient> | undefined;
export function productEventsClient() {
  if (
    typeof window === "undefined" ||
    process.env.NEXT_PUBLIC_PRODUCT_EVENTS_ENABLED !== "true"
  )
    return null;
  if (!singleton) {
    singleton = createProductEventsClient({
      fetch: window.fetch.bind(window),
      now: Date.now,
      uuid: () => crypto.randomUUID(),
      schedule: (cb, ms) => setTimeout(cb, ms),
      cancel: clearTimeout,
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void singleton?.flush();
    });
    window.addEventListener("pagehide", () => {
      void singleton?.flush();
    });
    window.addEventListener("storage", (event) => {
      if (event.key === "manifold:event-context-reset") singleton?.reset();
    });
  }
  return singleton;
}
export function resetProductEventsClient() {
  productEventsClient()?.reset();
  try {
    localStorage.setItem("manifold:event-context-reset", String(Date.now()));
  } catch {
    /* storage may be unavailable */
  }
}
export function acceptProductEventContext(response: Response) {
  if (!response.ok) return;
  resetProductEventsClient();
  const value = response.headers.get(EVENT_CONTEXT_HEADER);
  if (value) productEventsClient()?.recognize(value);
}
export function trackExternalStore(input: ClientEventInput) {
  const client = productEventsClient();
  if (client?.capture(input)) void client.flush();
}
