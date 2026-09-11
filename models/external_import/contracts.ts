import type { Game, Prisma } from "generated/prisma/client";
import type { ExternalRefreshInfo } from "lib/external_refresh";
import type { GameFeatures } from "lib/game_features";

export interface ImportedText {
  title: string;
  description: string;
  detailed_description: string;
}

export interface ImportedPrice {
  amount: string | null;
  original_amount: string | null;
  currency: string | null;
  discount_percent: number | null;
  captured_at: Date;
}

/** Source data only. Identity, moderation, ownership and local prices are not writable fields. */
export interface StoreSnapshot {
  externalId: string;
  suggestedSlug: string;
  fields: ImportedText & {
    launch_date: Date | null;
    developer_name: string;
    publisher_name: string | null;
    tags: string[];
    meta_tags: Prisma.InputJsonObject & { features?: GameFeatures };
    media: Prisma.InputJsonObject;
    social_links?: Prisma.InputJsonObject;
    requirements?: Prisma.InputJsonObject;
  };
  localizations: (ImportedText & { locale: string })[];
  offers: (ImportedPrice & {
    country: string;
    currency: string;
    url: string;
  })[];
  /** Kept separately for existing consumers of a provider's primary price columns. */
  primaryPrice?: ImportedPrice;
}

export interface ImportAudit {
  regionalOutcomes: Record<string, string>;
  descriptorIds?: number[];
  descriptorsPresent?: boolean;
  failureOutcome:
    | "SERVICE_ERROR"
    | "NOT_FOUND"
    | "BLOCKED_ADULT"
    | "INVALID_DATA";
}

export type ImportOutcome =
  | ImportAudit["failureOutcome"]
  | "SUCCESS"
  | "SKIPPED_MANAGED"
  | "CAPACITY_UNAVAILABLE"
  | "SHARED_IN_PROGRESS"
  | "CACHED_FAILURE"
  | "CACHE_HIT";

/** A strategy knows a source's reference and catalog format, never its persistence or scheduling. */
export interface StoreImportStrategy<Reference> {
  parseReference(input: string): Reference;
  fetchSnapshot(
    reference: Reference,
    audit: ImportAudit,
  ): Promise<StoreSnapshot>;
}

export interface ImportResult {
  game: Game | null;
  created: boolean;
  refresh: ExternalRefreshInfo | null;
}

export interface ImportDependencies<
  Reference,
  Lease extends { state: string },
  Transaction,
> {
  label: string;
  strategy: StoreImportStrategy<Reference>;
  attempts: {
    reserve(
      userId: string,
      reference: Reference,
      isAdmin: boolean,
    ): Promise<{ id: string }>;
    finish(
      id: string,
      outcome: ImportOutcome,
      audit?: ImportAudit,
      error?: unknown,
    ): Promise<void>;
  };
  managedGame(reference: Reference): Promise<Game | null>;
  coordination: {
    reserve(
      reference: Reference,
    ): Promise<{ acquired: boolean; row: Lease; game: Game | null }>;
    fence(tx: Transaction, row: Lease): Promise<unknown>;
    complete(
      tx: Transaction,
      row: Lease,
      game: Game,
      outcomes: Record<string, string>,
      reference: Reference,
    ): Promise<Lease>;
    fail(
      row: Lease,
      error: Error,
      outcomes: Record<string, string>,
    ): Promise<unknown>;
    failure(row: Lease): Error;
    metadata(row: Lease, cached?: boolean): ExternalRefreshInfo;
  };
  transaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T>;
  persist(
    tx: Transaction,
    snapshot: StoreSnapshot,
  ): Promise<{ game: Game; created: boolean }>;
}
