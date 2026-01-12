/**
 * routes/AppRouter.jsx
 * Main routing component
 * Handles all route rendering and navigation
 */

import { Routes, Route, Navigate } from "react-router-dom";
import { routes, DEFAULT_ROUTE } from "./index";

export default function AppRouter() {
  return (
    <Routes>
      {/* Default redirect */}
      <Route path="/" element={<Navigate to={DEFAULT_ROUTE} replace />} />

      {/* Dynamic routes from configuration */}
      {routes.map((route) => (
        <Route
          key={route.path}
          path={route.path}
          element={<route.component />}
        />
      ))}

      {/* 404 - Redirect to dashboard */}
      <Route path="*" element={<Navigate to={DEFAULT_ROUTE} replace />} />
    </Routes>
  );
}
