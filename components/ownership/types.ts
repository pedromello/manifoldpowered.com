export type OwnershipClaimStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface OwnershipClaimGame {
  id: string;
  slug: string;
  title: string;
}

export interface OwnershipClaimStudio {
  id: string;
  slug: string;
  name: string;
}

export interface OwnershipClaimUser {
  id: string;
  username: string;
  email?: string;
}

export interface OwnershipClaimApi {
  id: string;
  status: OwnershipClaimStatus;
  game: OwnershipClaimGame;
  studio: OwnershipClaimStudio;
  requested_by: OwnershipClaimUser;
  decided_by: OwnershipClaimUser | null;
  terms: {
    version: string;
    locale: "en" | "pt-BR";
    text: string;
    accepted_at: string;
  };
  decision: {
    reason: string | null;
    decided_at: string | null;
  };
  created_at: string;
  updated_at: string;
}

export interface OwnershipClaimsResponse {
  claims: OwnershipClaimApi[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface OwnershipTermsApi {
  version: string;
  digest: string;
  locale: "en" | "pt-BR";
  text: string;
}

export interface StudioOwnershipClaimResponse {
  claims: OwnershipClaimApi[];
  current_terms: OwnershipTermsApi;
}
