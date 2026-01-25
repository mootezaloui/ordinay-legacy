import { useEffect } from "react";

let lockCount = 0;
let originalBodyOverflow = "";
let originalBodyPaddingRight = "";
let originalBodyPosition = "";
let originalBodyTop = "";
let originalBodyLeft = "";
let originalBodyRight = "";
let originalBodyWidth = "";
let originalHtmlOverflow = "";
let originalHtmlPaddingRight = "";
let lockedScrollY = 0;
let lockedScrollX = 0;

const getScrollbarWidth = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return 0;
  return window.innerWidth - document.documentElement.clientWidth;
};

const lockBodyScroll = () => {
  if (typeof document === "undefined") return;

  if (lockCount === 0) {
    const bodyStyle = document.body.style;
    const htmlStyle = document.documentElement.style;
    originalBodyOverflow = bodyStyle.overflow;
    originalBodyPaddingRight = bodyStyle.paddingRight;
    originalBodyPosition = bodyStyle.position;
    originalBodyTop = bodyStyle.top;
    originalBodyLeft = bodyStyle.left;
    originalBodyRight = bodyStyle.right;
    originalBodyWidth = bodyStyle.width;
    originalHtmlOverflow = htmlStyle.overflow;
    originalHtmlPaddingRight = htmlStyle.paddingRight;

    const scrollbarWidth = getScrollbarWidth();
    lockedScrollY = window.scrollY || window.pageYOffset || 0;
    lockedScrollX = window.scrollX || window.pageXOffset || 0;

    htmlStyle.overflow = "hidden";
    bodyStyle.overflow = "hidden";
    bodyStyle.position = "fixed";
    bodyStyle.top = `-${lockedScrollY}px`;
    bodyStyle.left = `-${lockedScrollX}px`;
    bodyStyle.right = "0";
    bodyStyle.width = "100%";

    if (scrollbarWidth > 0) {
      bodyStyle.paddingRight = `${scrollbarWidth}px`;
      htmlStyle.paddingRight = `${scrollbarWidth}px`;
    }
  }

  lockCount += 1;
};

const unlockBodyScroll = () => {
  if (typeof document === "undefined") return;

  lockCount = Math.max(0, lockCount - 1);

  if (lockCount === 0) {
    const bodyStyle = document.body.style;
    const htmlStyle = document.documentElement.style;
    bodyStyle.overflow = originalBodyOverflow;
    bodyStyle.paddingRight = originalBodyPaddingRight;
    bodyStyle.position = originalBodyPosition;
    bodyStyle.top = originalBodyTop;
    bodyStyle.left = originalBodyLeft;
    bodyStyle.right = originalBodyRight;
    bodyStyle.width = originalBodyWidth;
    htmlStyle.overflow = originalHtmlOverflow;
    htmlStyle.paddingRight = originalHtmlPaddingRight;

    if (typeof window !== "undefined") {
      window.scrollTo(lockedScrollX, lockedScrollY);
    }
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
