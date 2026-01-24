import { useEffect, useState, useContext, useMemo } from 'react';
import { ThemeContext } from './theme';

const THEME_STORAGE_KEY = "theme";
const THEME_PREFERENCE_KEY = "themePreference";

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export function ThemeProvider({ children }) {
  // Initialize from localStorage or system preference
  const [themePreference, setThemePreference] = useState(() => {
    const storedPreference = localStorage.getItem(THEME_PREFERENCE_KEY);
    if (storedPreference === "light" || storedPreference === "dark" || storedPreference === "system") {
      return storedPreference;
    }

    // Fallback to legacy key
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }

    return "system";
  });

  const systemTheme = useMemo(
    () => (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
    []
  );

  const resolvedTheme = themePreference === "system" ? systemTheme : themePreference;

  // Apply theme to DOM and persist to localStorage
  useEffect(() => {
    const root = document.documentElement;
    
    // Remove both classes first
    root.classList.remove('light', 'dark');
    
    // Add the current theme class
    root.classList.add(resolvedTheme);
    
    // Persist to localStorage
    localStorage.setItem(THEME_STORAGE_KEY, resolvedTheme);
    localStorage.setItem(THEME_PREFERENCE_KEY, themePreference);
  }, [resolvedTheme, themePreference]);

  // Listen for system theme changes (optional but nice UX)
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e) => {
      if (themePreference === "system") {
        const next = e.matches ? 'dark' : 'light';
        localStorage.setItem(THEME_STORAGE_KEY, next);
        const root = document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(next);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [themePreference]);

  const toggleTheme = () => {
    const newTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
    setThemePreference(newTheme);
  };

  const setTheme = (newTheme) => {
    setThemePreference(newTheme);
  };

  const value = {
    theme: resolvedTheme,
    themePreference,
    isDark: resolvedTheme === 'dark',
    toggleTheme,
    setTheme,
    setThemePreference,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
