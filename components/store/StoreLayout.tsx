import { ReactNode } from "react";
import { StoreTopNav } from "./StoreTopNav";
import { StoreFooter } from "./StoreFooter";

export function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <StoreTopNav />
      {/* 
        The top nav is fixed and transparent, some pages handle their own padding.
        We provide the common layout structure here.
      */}
      {children}
      <StoreFooter />
    </>
  );
}
