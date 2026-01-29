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
    label: "Tasks",
    route: "/tasks",
  },
  {
    icon: "fas fa-gavel",
    label: "lawsuits",
    route: "/lawsuits",
  },
  {
    icon: "fas fa-calendar",
    label: "Sessions",
    route: "/sessions",
  },
  {
    icon: "fas fa-sticky-note",
    label: "Personal Tasks",
    route: "/personal-tasks",
  },
  {
    icon: "fas fa-user-tie",
    label: "Bailiffs",
    route: "/officers",
  },
  {
    icon: "fas fa-calculator",
    label: "Accounting",
    route: "/accounting",
  },
  {
    icon: "fas fa-robot",
    label: "Ordinay Intelligence",
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
