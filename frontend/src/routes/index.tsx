/**
 * routes/index.tsx
 * Central route configuration
 * All application routes are defined here
 */

import { ComponentType, ReactNode, Suspense, lazy } from "react";
import Dashboard from "../Screens/Dashboard";
import Clients from "../Screens/Clients";
import Dossiers from "../Screens/Dossiers";
import Tasks from "../Screens/Tasks";
import Cases from "../Screens/Lawsuits";
import Sessions from "../Screens/Sessions";
import PersonalTasks from "../Screens/PersonalTasks";
import Officers from "../Screens/Officers";
import Accounting from "../Screens/Accounting";
import ComingSoonAI from "../Screens/ComingSoonAI";
import Profile from "../Screens/Profile";
import Settings from "../Screens/Settings";
import NotFound from "../Screens/NotFound";
import Login from "../Screens/Auth/Login";
import SignUp from "../Screens/Auth/SignUp";
import ForgotPassword from "../Screens/Auth/ForgetPassword";
import NotificationCenter from "../components/notifications/NotificationCenter";
import DetailView from "../components/DetailView/DetailView";
import { FEATURE_AI_AGENT } from "../config/features";
import { t } from "../i18n";
import AgentScreen from "../Agent_front/AgentScreen";

/**
 * Route configuration type
 */
export interface RouteConfig {
  path: string;
  component: ComponentType<Record<string, unknown>> | (() => ReactNode);
  name: string;
  icon: string;
  label?: string;
}

let ChatBotRouteComponent: RouteConfig["component"] = FEATURE_AI_AGENT
  ? AgentScreen
  : ComingSoonAI;

/**
 * Route configuration array
 * Each route contains: path, component, name, icon
 */
export const routes: RouteConfig[] = [
  {
    path: "/dashboard",
    component: Dashboard,
    name: "Dashboard",
    icon: "fas fa-th-large",
    label: "Dashboard",
  },
  {
    path: "/clients",
    component: Clients,
    name: "Clients",
    icon: "fas fa-users",
    label: "Clients",
  },
  {
    path: "/clients/:id",
    component: () => <DetailView entityType="client" />,
    name: "ClientDetail",
    icon: "fas fa-user",
    label: "Détails Client",
  },
  {
    path: "/dossiers",
    component: Dossiers,
    name: "Dossiers",
    icon: "fas fa-folder-open",
    label: "Dossiers",
  },
  {
    path: "/dossiers/:id",
    component: () => <DetailView entityType="dossier" />,
    name: "DossierDetail",
    icon: "fas fa-folder",
    label: "Détails Dossier",
  },
  {
    path: "/tasks",
    component: Tasks,
    name: "Tasks",
    icon: "fas fa-tasks",
    label: "Tâches",
  },
  {
    path: "/tasks/:id",
    component: () => <DetailView entityType="task" />,
    name: "TaskDetail",
    icon: "fas fa-tasks",
    label: "Détails Tâche",
  },
  {
    path: "/personal-tasks",
    component: PersonalTasks,
    name: "PersonalTasks",
    icon: "fas fa-sticky-note",
    label: "Tâches Personnelles",
  },
  {
    path: "/personal-tasks/:id",
    component: () => <DetailView entityType="personalTask" />,
    name: "PersonalTaskDetail",
    icon: "fas fa-sticky-note",
    label: "Détails Tâche Personnelle",
  },
  {
    path: "/lawsuits",
    component: Cases,
    name: "lawsuits",
    icon: "fas fa-gavel",
    label: "Procès",
  },
  {
    path: "/lawsuits/:id",
    component: () => <DetailView entityType="lawsuit" />,
    name: "CaseDetail",
    icon: "fas fa-gavel",
    label: "Détails Procès",
  },
  {
    path: "/sessions",
    component: Sessions,
    name: "Sessions",
    icon: "fas fa-calendar",
    label: "Audience ",
  },
  {
    path: "/sessions/:id",
    component: () => <DetailView entityType="session" />,
    name: "SessionDetail",
    icon: "fas fa-calendar",
    label: "Détails Séance",
  },

  {
    path: "/officers",
    component: Officers,
    name: "Officers",
    icon: "fas fa-user-tie",
    label: "Huissier",
  },
  {
    path: "/officers/:id",
    component: () => <DetailView entityType="officer" />,
    name: "OfficerDetail",
    icon: "fas fa-user-tie",
    label: "Détails Huissier",
  },
  {
    path: "/missions/:id",
    component: () => <DetailView entityType="mission" />,
    name: "MissionDetail",
    icon: "fas fa-clipboard-check",
    label: "Détails Mission",
  },
  {
    path: "/accounting",
    component: Accounting,
    name: "Accounting",
    icon: "fas fa-calculator",
    label: "Comptabilité",
  },
  {
    path: "/accounting/:id",
    component: () => <DetailView entityType="financialEntry" />,
    name: "FinancialEntryDetail",
    icon: "fas fa-file-invoice-dollar",
    label: "Détails Écriture",
  },

  {
    path: "/chatbot",
    component: ChatBotRouteComponent,
    name: "ChatBot",
    icon: "fas fa-robot",
    label: FEATURE_AI_AGENT
      ? "Ordinay Intelligence"
      : "Ordinay Intelligence (Coming Soon)",
  },
  {
    path: "/profile",
    component: Profile,
    name: "Profile",
    icon: "fas fa-user",
    label: "Profile",
  },
  {
    path: "/settings",
    component: Settings,
    name: "Settings",
    icon: "fas fa-cog",
    label: "Settings",
  },
  {
    path: "/login",
    component: Login,
    name: "Login",
    icon: "fas fa-sign-in-alt",
  },
  {
    path: "/signup",
    component: SignUp,
    name: "SignUp",
    icon: "fas fa-user-plus",
  },
  {
    path: "/forgot-password",
    component: ForgotPassword,
    name: "ForgotPassword",
    icon: "fas fa-unlock-alt",
  },
  // UPDATED: Use NotificationCenter component
  {
    path: "/notifications",
    component: NotificationCenter,
    name: "Notifications",
    icon: "fas fa-bell",
    label: t("routes.labels.notifications", { ns: "notifications" }),
  },

  {
    path: "*",
    component: NotFound,
    name: "NotFound",
    icon: "fas fa-exclamation-triangle",
  },
];

/**
 * Get route by path
 */
export const getRouteByPath = (path: string): RouteConfig | undefined => {
  return routes.find((route) => route.path === path);
};

/**
 * Get all route paths
 */
export const getRoutePaths = (): string[] => {
  return routes.map((route) => route.path);
};

/**
 * Default redirect route
 */
export const DEFAULT_ROUTE = "/dashboard";
