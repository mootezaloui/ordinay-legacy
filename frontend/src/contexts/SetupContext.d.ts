import type { ReactNode } from "react";

export type SetupContextValue = {
  isInitialized: boolean;
  completeSetup: () => void;
};

export function SetupProvider(props: { children: ReactNode }): JSX.Element;
export function useSetup(): SetupContextValue;
