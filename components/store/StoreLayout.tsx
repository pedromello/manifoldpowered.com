import { ReactNode } from "react";
import { StoreTopNav, type StoreNavContext } from "./StoreTopNav";
import { StoreFooter } from "./StoreFooter";

export function StoreLayout({
  children,
  store,
  visitorPreview = false,
}: {
  children: ReactNode;
  store?: StoreNavContext;
  visitorPreview?: boolean;
}) {
  return (
    <>
      <StoreTopNav store={store} visitorPreview={visitorPreview} />
      {/*
        The top nav is fixed and transparent, some pages handle their own padding.
        We provide the common layout structure here.
      */}
      {children}
      <StoreFooter store={store} visitorPreview={visitorPreview} />
    </>
  );
}
