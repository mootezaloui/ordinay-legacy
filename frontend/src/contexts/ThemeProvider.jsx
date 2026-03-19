import { useEffect, useState, useContext, useLayoutEffect, useMemo } from 'react';
import { flushSync } from 'react-dom';
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
  useLayoutEffect(() => {
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

  const applyThemeWithTransition = (newThemePreference, e) => {
    // Fallback if View Transitions aren't supported
    if (!e || typeof document.startViewTransition !== "function") {
      setThemePreference(newThemePreference);
      return;
    }

    // Determine coordinates: use pointer coordinates if available, 
    // otherwise fallback to center of the target element (useful for <select>)
    let x, y;
    if (e.clientX !== undefined && e.clientY !== undefined && (e.clientX !== 0 || e.clientY !== 0)) {
      x = e.clientX;
      y = e.clientY;
    } else if (e.target && typeof e.target.getBoundingClientRect === 'function') {
      const rect = e.target.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height / 2;
    } else {
      // Final fallback to center of screen
      x = window.innerWidth / 2;
      y = window.innerHeight / 2;
    }

    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    const transition = document.startViewTransition(() => {
      // Temporarily suppress global CSS transitions during state change and snapshot capture
      document.documentElement.classList.add("view-transitioning");
      
      flushSync(() => {
        setThemePreference(newThemePreference);
      });
    });

    transition.finished.finally(() => {
      document.documentElement.classList.remove("view-transitioning");
    });

    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 400,
          easing: "cubic-bezier(0.165, 0.84, 0.44, 1)",
          pseudoElement: "::view-transition-new(root)",
        }
      );
    });
  };

  const toggleTheme = (e) => {
    const newThemePreference = resolvedTheme === "dark" ? "light" : "dark";
    applyThemeWithTransition(newThemePreference, e);
  };

  const setTheme = (newTheme, e) => {
    applyThemeWithTransition(newTheme, e);
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
