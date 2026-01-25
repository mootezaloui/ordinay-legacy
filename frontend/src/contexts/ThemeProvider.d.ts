import type { ReactNode } from "react";

export type ThemeContextValue = {
  theme: string;
  themePreference: string;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (newTheme: string) => void;
  setThemePreference: (newTheme: string) => void;
};

export function ThemeProvider(props: { children: ReactNode }): JSX.Element;
export function useTheme(): ThemeContextValue;
