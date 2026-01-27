import type { ReactNode } from "react";

export function SidebarProvider(props: { children: ReactNode }): JSX.Element;
export function useSidebar(): {
  isCollapsed: boolean;
  toggleSidebar: () => void;
  setIsCollapsed: (value: boolean | ((prev: boolean) => boolean)) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  toggleMobile: () => void;
  openMobile: () => void;
  closeMobile: () => void;
};
