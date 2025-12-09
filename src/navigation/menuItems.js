/**
 * navigation/menuItems.js
 * Navigation menu configuration
 * Used by Sidebar component
 */

/**
 * Main navigation menu items
 * Matches the routes configuration
 */
export const menuItems = [
  {
    icon: "fas fa-th-large",
    label: "Dashboard",
    route: "/dashboard",
  },
  {
    icon: "fas fa-users",
    label: "Clients",
    route: "/clients",
  },
  {
    icon: "fas fa-folder-open",
    label: "Dossiers",
    route: "/dossiers",
  },
  {
    icon: "fas fa-tasks",
    label: "Tâches",
    route: "/tasks",
  },
  {
    icon: "fas fa-gavel",
    label: "Procès",
    route: "/cases",
  },
  {
    icon: "fas fa-calendar",
    label: "Séances Juridiques",
    route: "/sessions",
  },
  {
    icon: "fas fa-sticky-note",
    label: "Tâches Personnelles",
    route: "/personal-tasks",
  },
  {
    icon: "fas fa-user-tie",
    label: "Huissier",
    route: "/officers",
  },
  {
    icon: "fas fa-calculator",
    label: "Comptabilité",
    route: "/accounting",
  },
  {
    icon: "fas fa-robot",
    label: "ChatBot",
    route: "/chatbot",
  },
];

/**
 * Secondary navigation items (can be used for settings, profile, etc.)
 */
export const secondaryMenuItems = [
  // Future: Add settings, profile, etc.
];

/**
 * Get menu item by route
 */
export const getMenuItemByRoute = (route) => {
  return menuItems.find((item) => item.route === route);
};
