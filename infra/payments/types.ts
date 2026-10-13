export type PaymentProviderName = "appmax" | "stripe";
export type PaymentEnvironment = "sandbox";
export type PaymentMethod = "pix" | "card";
export type PaymentState =
  | "UNPAID"
  | "PENDING"
  | "PROCESSING"
  | "PAID"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED"
  | "DISPUTED";
export type PaymentQuote = {
  installments: number;
  total_minor: number;
  interest_minor: number;
};
export type PaymentBuyer = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  document_number: string;
  ip: string;
  holder_name?: string;
  holder_document_number?: string;
};
export type PaymentContext = {
  order_id: string;
  attempt_id: string;
  product_name: string;
  product_code: string;
  method: PaymentMethod;
  amount_minor: number;
  currency: string;
  installments: number;
  customer_id?: string;
  remote_order_id?: string;
};
export type PaymentSnapshot = {
  remote_order_id: string;
  remote_customer_id?: string;
  remote_payment_id?: string;
  state: PaymentState;
  total_minor: number;
  currency: string;
  method: PaymentMethod;
  installments: number;
  paid_at?: Date;
  delivery_blocked?: boolean;
  checkout_url?: string;
  expires_at?: Date;
  pix_emv?: string;
  pix_qrcode?: string;
};
export interface PaymentProvider {
  name: PaymentProviderName;
  configured(): boolean;
  capabilities: {
    methods: PaymentMethod[];
    installments: boolean;
    hosted: boolean;
  };
  quote(
    amountMinor: number,
    installments: number,
    method?: PaymentMethod,
  ): Promise<PaymentQuote>;
  quotes(amountMinor: number): Promise<PaymentQuote[]>;
  createCustomer(buyer: PaymentBuyer): Promise<string | undefined>;
  createOrder(input: PaymentContext): Promise<string>;
  pay(
    input: PaymentContext,
    buyer: PaymentBuyer,
    cardToken?: string,
  ): Promise<PaymentSnapshot>;
  retrieve(input: PaymentContext): Promise<PaymentSnapshot>;
  cancel?(input: PaymentContext): Promise<PaymentSnapshot>;
}
