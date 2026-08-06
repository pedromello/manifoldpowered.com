import { useEffect, useState } from "react";

export function useStandaloneMode(): boolean {
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(display-mode: standalone)");
    const iosStandalone =
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true;

    const update = () => setIsStandalone(mql.matches || iosStandalone);
    update();

    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle(
      "is-standalone-pwa",
      isStandalone,
    );
  }, [isStandalone]);

  return isStandalone;
}
