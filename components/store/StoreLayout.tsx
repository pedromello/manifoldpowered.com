import { ReactNode } from "react";
import { StoreTopNav, type StoreNavContext } from "./StoreTopNav";
import { StoreFooter } from "./StoreFooter";

export function StoreLayout({
  children,
  store,
}: {
  children: ReactNode;
  store?: StoreNavContext;
}) {
  return (
    <>
      <StoreTopNav store={store} />
      {/*
        The top nav is fixed and transparent, some pages handle their own padding.
        We provide the common layout structure here.
      */}
      {children}
      <StoreFooter />
    </>
  );
}
