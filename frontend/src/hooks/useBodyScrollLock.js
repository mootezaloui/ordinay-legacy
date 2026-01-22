import { useEffect } from "react";

let lockCount = 0;
let originalOverflow = "";
let originalPaddingRight = "";

const getScrollbarWidth = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;
  return window.innerWidth - document.documentElement.clientWidth;
};

const lockBodyScroll = () => {
  if (typeof document === "undefined") return;

  if (lockCount === 0) {
    originalOverflow = document.body.style.overflow;
    originalPaddingRight = document.body.style.paddingRight;

    const scrollbarWidth = getScrollbarWidth();
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    document.body.style.overflow = "hidden";
  }

  lockCount += 1;
};

const unlockBodyScroll = () => {
  if (typeof document === "undefined") return;

  lockCount = Math.max(0, lockCount - 1);

  if (lockCount === 0) {
    document.body.style.overflow = originalOverflow;
    document.body.style.paddingRight = originalPaddingRight;
  }
};

export default function useBodyScrollLock(isLocked = true) {
  useEffect(() => {
    if (!isLocked) return;
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, [isLocked]);
}
