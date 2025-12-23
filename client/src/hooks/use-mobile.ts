import { useEffect, useState } from "react";

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    const update = () => setIsMobile(window.matchMedia("(max-width: 768px)").matches);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return isMobile;
}

export function useIsMobileResolved(): { isMobile: boolean; isResolved: boolean } {
  const isMobile = useIsMobile();
  return { isMobile, isResolved: true };
}
