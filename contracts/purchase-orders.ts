export type BuyerOrder = {
  id: string;
  item_type: "GAME" | "GIFT_CARD";
  item_id: string;
  product_name: string;
  product_slug: string | null;
  image_url: string | null;
  amount_minor: number;
  total_minor: number;
  interest_minor: number;
  installments: number;
  currency: string;
  payment_status: string;
  delivery_status: string;
  created_at: string;
  gift_card_order_id: string | null;
  can_pay: boolean;
  can_cancel: boolean;
};
export type BuyerCheckout = {
  order: BuyerOrder;
  checkout: {
    available: boolean;
    methods: ("pix" | "card")[];
    hosted: boolean;
    installments: boolean;
    external_id: string | null;
    script_url: string | null;
  };
  attempt: null | {
    id: string;
    method: string;
    installments: number;
    total_minor: number;
    interest_minor: number;
    quote_expires_at: string;
    submitted: boolean;
    uncertain: boolean;
    checkout_url: string | null;
    pix: null | { emv: string; qrcode: string; expires_at: string | null };
  };
};
