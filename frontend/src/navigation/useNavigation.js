/**
 * navigation/useNavigation.js
 * Custom hooks and utilities for navigation
 */

import { useNavigate, useLocation } from "react-router-dom";
import { routes } from "../routes";
import { menuItems } from "./menuItems";

/**
 * Custom hook for navigation utilities
 */
export function useAppNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  /**
   * Navigate to a specific route
   */
  const navigateTo = (path) => {
    navigate(path);
  };

  /**
   * Go back to previous page
   */
  const goBack = () => {
    navigate(-1);
  };

  /**
   * Check if current route matches
   */
  const isCurrentRoute = (path) => {
    return location.pathname === path;
  };

  /**
   * Get current route info
   */
  const getCurrentRoute = () => {
    return routes.find((route) => route.path === location.pathname);
  };

  /**
   * Get current menu item
   */
  const getCurrentMenuItem = () => {
    return menuItems.find((item) => item.route === location.pathname);
  };

  return {
    navigateTo,
    goBack,
    isCurrentRoute,
    getCurrentRoute,
    getCurrentMenuItem,
    currentPath: location.pathname,
  };
}

/**
 * Navigation breadcrumbs helper
 */
export function getBreadcrumbs(pathname) {
  const paths = pathname.split("/").filter(Boolean);
  const breadcrumbs = [];

  let currentPath = "";
  paths.forEach((path) => {
    currentPath += `/${path}`;
    const route = routes.find((r) => r.path === currentPath);
    if (route) {
      breadcrumbs.push({
        label: route.label,
        path: currentPath,
      });
    }
  });

  return breadcrumbs;
}