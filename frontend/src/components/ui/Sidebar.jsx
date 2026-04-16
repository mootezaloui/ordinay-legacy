import { Link, useLocation } from "react-router-dom";
import { useTheme } from "../../contexts/theme";
import { useSidebar } from "../../contexts/SidebarContext";
import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useTutorialSafe } from "../../contexts/TutorialContext";

// Module-level: persists across component unmount/remount cycles
let _lastIndicatorY = null;
let _lastIndicatorH = null;

export default function Sidebar() {
  const { isCollapsed, toggleSidebar, isMobileOpen, closeMobile } = useSidebar();
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();
  const prevPathRef = useRef(location.pathname);
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 767px)").matches;
  });
  const { t } = useTranslation("layout");
  const tutorial = useTutorialSafe();

  const tutorialTargetByRoute = useMemo(
    () => ({
      "/dashboard": "sidebar-dashboard-link",
      "/clients": "sidebar-clients-link",
      "/dossiers": "sidebar-dossiers-link",
      "/personal-tasks": "sidebar-personal-tasks-link",
      "/sessions": "sidebar-sessions-link",
      "/officers": "sidebar-officers-link",
      "/accounting": "sidebar-accounting-link",
    }),
    [],
  );

  const currentTutorialSidebarTarget =
    tutorial?.isActive && tutorial?.currentStep?.target?.startsWith("sidebar-")
      ? tutorial.currentStep.target
      : null;

  const tutorialTargetRoute = useMemo(() => {
    if (!currentTutorialSidebarTarget) return null;
    const matched = Object.entries(tutorialTargetByRoute).find(
      ([, target]) => target === currentTutorialSidebarTarget,
    );
    return matched ? matched[0] : null;
  }, [currentTutorialSidebarTarget, tutorialTargetByRoute]);

  const shouldMuteRouteIndicator =
    Boolean(currentTutorialSidebarTarget) &&
    Boolean(tutorialTargetRoute) &&
    !location.pathname.startsWith(tutorialTargetRoute);

  // ── Animated indicator ──
  const navContainerRef = useRef(null);
  const itemRefs = useRef({});
  const indicatorRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 767px)");
    const handleChange = () => setIsMobileViewport(media.matches);
    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (prevPathRef.current !== location.pathname && isMobileOpen) {
      closeMobile();
    }
    prevPathRef.current = location.pathname;
  }, [location.pathname, isMobileOpen, closeMobile]);

  const isCompact = isCollapsed && !isMobileViewport;

  const navigationGroups = [
    {
      id: "primary",
      items: [
        { icon: "fas fa-th-large", label: t("sidebar.dashboard"), route: "/dashboard" },
      ]
    },
    {
      id: "core",
      label: t("sidebar.groups.core", { defaultValue: "Core" }),
      items: [
        { icon: "fas fa-users", label: t("sidebar.clients"), route: "/clients" },
        { icon: "fas fa-folder-open", label: t("sidebar.dossiers"), route: "/dossiers" },
        { icon: "fas fa-gavel", label: t("sidebar.lawsuits"), route: "/lawsuits" },
      ]
    },
    {
      id: "workflow",
      label: t("sidebar.groups.workflow", { defaultValue: "Workflow" }),
      items: [
        { icon: "fas fa-tasks", label: t("sidebar.tasks"), route: "/tasks" },
        { icon: "fas fa-calendar", label: t("sidebar.sessions"), route: "/sessions" },
        { icon: "fas fa-sticky-note", label: t("sidebar.personalTasks"), route: "/personal-tasks" },
      ]
    },
    {
      id: "operations",
      label: t("sidebar.groups.operations", { defaultValue: "Operations" }),
      items: [
        { icon: "fas fa-user-tie", label: t("sidebar.officers"), route: "/officers" },
        { icon: "fas fa-calculator", label: t("sidebar.accounting"), route: "/accounting" },
      ]
    },
    {
      id: "tools",
      label: t("sidebar.groups.tools", { defaultValue: "Tools" }),
      items: [
        { icon: "fas fa-robot", label: t("sidebar.chatbot"), route: "/chatbot" },
      ]
    }
  ];

  const allRoutes = useMemo(
    () => navigationGroups.flatMap(g => g.items.map(i => i.route)),
    [t]
  );

  const setItemRef = useCallback((route, el) => {
    if (el) {
      itemRefs.current[route] = el;
    }
  }, []);

  // Measure where the current active item is
  const measureActive = useCallback(() => {
    const container = navContainerRef.current;
    if (!container) return null;

    const pathname = location.pathname;
    const activeRoute = allRoutes.find(r => pathname.startsWith(r));
    if (!activeRoute || !itemRefs.current[activeRoute]) return null;

    const activeEl = itemRefs.current[activeRoute];
    const containerRect = container.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();

    return {
      y: activeRect.top - containerRect.top + container.scrollTop,
      h: activeRect.height,
    };
  }, [allRoutes, location.pathname]);

  // Animate indicator only when navigation state changes.
  useLayoutEffect(() => {
    const indicator = indicatorRef.current;
    if (!indicator) return;

    // Wait for DOM refs to be ready
    const raf = requestAnimationFrame(() => {
      const target = measureActive();
      if (!target) {
        indicator.style.opacity = "0";
        return;
      }

      // Always set the final position immediately
      indicator.style.transform = `translateY(${target.y}px)`;
      indicator.style.height = `${target.h}px`;
      indicator.style.opacity = shouldMuteRouteIndicator ? "0.28" : "1";

      if (_lastIndicatorY !== null && Math.abs(_lastIndicatorY - target.y) > 1) {
        // Animate from old position to new using Web Animations API
        indicator.animate(
          [
            {
              transform: `translateY(${_lastIndicatorY}px)`,
              height: `${_lastIndicatorH}px`,
            },
            {
              transform: `translateY(${target.y}px)`,
              height: `${target.h}px`,
            },
          ],
          {
            duration: 220,
            easing: "cubic-bezier(0.2, 0, 0, 1)",
            fill: "none",
          }
        );
      }

      // Store for next mount
      _lastIndicatorY = target.y;
      _lastIndicatorH = target.h;
    });
    return () => cancelAnimationFrame(raf);
  }, [location.pathname, isCollapsed, isCompact, measureActive, shouldMuteRouteIndicator]);

  // On sidebar collapse: recalculate after the sidebar's own CSS transition finishes
  useEffect(() => {
    const timer = setTimeout(() => {
      const indicator = indicatorRef.current;
      if (!indicator) return;
      const target = measureActive();
      if (!target) return;
      indicator.style.transition = "none";
      indicator.style.transform = `translateY(${target.y}px)`;
      indicator.style.height = `${target.h}px`;
      indicator.style.opacity = shouldMuteRouteIndicator ? "0.28" : "1";
      _lastIndicatorY = target.y;
      _lastIndicatorH = target.h;
    }, 320);
    return () => clearTimeout(timer);
  }, [isCollapsed, shouldMuteRouteIndicator]); // eslint-disable-line react-hooks/exhaustive-deps

  // On resize
  useEffect(() => {
    const handleResize = () => {
      const indicator = indicatorRef.current;
      if (!indicator) return;
      const target = measureActive();
      if (!target) return;
      indicator.style.transition = "none";
      indicator.style.transform = `translateY(${target.y}px)`;
      indicator.style.height = `${target.h}px`;
      indicator.style.opacity = shouldMuteRouteIndicator ? "0.28" : "1";
      _lastIndicatorY = target.y;
      _lastIndicatorH = target.h;
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [measureActive, shouldMuteRouteIndicator]);

  return (
    <aside
      id="mobile-sidebar"
      className={`sidebar-shell fixed left-0 flex flex-col border-r z-40 titlebar-offset-top titlebar-offset-height bg-background text-foreground border-border transition-[width,transform] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isMobileOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 ${isCollapsed ? "md:w-[72px]" : "md:w-64"} w-[84vw] max-w-[320px]`}
    >
      {/* Modern Edge-attached Sidebar Toggle Pill */}
      <div 
        className="absolute -right-4 top-[10%] bottom-[10%] w-4 cursor-pointer group flex items-center justify-center hidden md:flex z-50"
        onClick={toggleSidebar}
        title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <div className="h-20 w-1.5 bg-border rounded-full flex items-center justify-center group-hover:h-32 group-hover:w-4 group-hover:bg-primary/20 transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] border border-transparent group-hover:border-primary/30 group-hover:shadow-[0_0_12px_rgba(59,130,246,0.15)] relative overflow-hidden">
             <i className={`${isCollapsed ? "fas fa-chevron-right" : "fas fa-chevron-left"} text-[8px] text-primary/70 opacity-0 group-hover:opacity-100 transition-opacity duration-300 absolute`}></i>
        </div>
      </div>

      {/* Navigation */}
      <nav
        ref={navContainerRef}
        className="sidebar-nav flex-1 pt-6 pb-3 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 scrollbar-track-transparent relative"
      >
        {/* ── Animated Sliding Indicator ── */}
        <div
          ref={indicatorRef}
          className="absolute left-3 right-3 rounded-xl pointer-events-none z-0"
          style={{
            top: 0,
            height: 0,
            opacity: 0,
            willChange: "transform, height, opacity",
          }}
        >
          <div className="absolute inset-0 rounded-xl bg-primary shadow-lg shadow-primary/25" />
          <div className="absolute inset-0 rounded-xl bg-primary/10" />
          <div className="absolute left-0 top-[15%] bottom-[15%] w-[3px] rounded-full bg-white/60" />
        </div>

        <div className="sidebar-groups space-y-6">
          {navigationGroups.map((group) => (
            <div key={group.id} className="sidebar-group px-3">
              {group.label && (
                <div className="px-3 mb-2 h-5 flex items-center">
                  {!isCompact ? (
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {group.label}
                  </span>
                  ) : (
                    <div className="w-full flex justify-center">
                      <div className="w-6 h-px bg-border"></div>
                    </div>
                  )}
                </div>
              )}

              <ul className="sidebar-items space-y-0.5">
                {group.items.map((item) => {
                  const isActive = location.pathname.startsWith(item.route);
                  const tutorialTarget = tutorialTargetByRoute[item.route];
                  const isTutorialTarget =
                    Boolean(currentTutorialSidebarTarget) &&
                    tutorialTarget === currentTutorialSidebarTarget;
                  return (
                    <li key={item.route}>
                      <Link
                        ref={(el) => setItemRef(item.route, el)}
                        to={item.route}
                        onClick={() => {
                          if (isMobileOpen) closeMobile();
                        }}
                        data-tutorial={tutorialTarget}
                        data-tutorial-sidebar-target={isTutorialTarget ? "true" : undefined}
                        className={`sidebar-item group relative flex items-center py-2.5 rounded-xl transition-colors duration-200 z-[1] ${isCompact ? "justify-center px-0 gap-0" : "justify-start gap-3 pl-[14px] pr-3"} ${isActive
                            ? currentTutorialSidebarTarget && !isTutorialTarget
                              ? "text-primary-foreground/80"
                              : "text-primary-foreground"
                            : "hover:bg-muted text-foreground hover:shadow-sm"
                          } ${isTutorialTarget
                            ? "bg-blue-500/22 ring-1 ring-blue-300/45 shadow-[inset_0_0_0_1px_rgba(148,197,255,0.24),0_8px_20px_-16px_rgba(96,165,250,0.85)]"
                            : ""
                          }`}
                      >
                        <span className={`relative flex items-center justify-center w-5 transition-transform duration-200 ${isActive ? "scale-110" : "group-hover:scale-105"
                          }`}>
                          <i
                            className={`${item.icon} text-base transition-colors duration-200 ${isActive
                              ? currentTutorialSidebarTarget && !isTutorialTarget
                                ? "text-primary-foreground/80"
                                : "text-primary-foreground"
                              : isTutorialTarget
                                ? "text-blue-100"
                              : "text-muted-foreground group-hover:text-foreground"
                              }`}
                          ></i>
                        </span>

                        {!isCompact && (
                          <span
                            className={`text-[13px] font-medium transition-colors duration-200 ${isActive
                              ? currentTutorialSidebarTarget && !isTutorialTarget
                                ? "text-primary-foreground/80"
                                : "text-primary-foreground"
                              : isTutorialTarget
                                ? "text-blue-100"
                              : "text-foreground"
                              }`}
                          >
                            {item.label}
                          </span>
                        )}

                        {isCompact && (
                          <span className="absolute left-full ml-4 px-3 py-1.5 bg-foreground text-background text-xs font-medium rounded-lg opacity-0 invisible pointer-events-none group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 shadow-xl">
                            {item.label}
                            <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-foreground"></span>
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="sidebar-footer border-t border-border bg-gradient-to-b from-transparent to-secondary/60">
        <div className="p-3 space-y-1">
          <button
            onClick={toggleTheme}
            className={`w-full group flex items-center py-2.5 rounded-xl transition-all duration-200 hover:bg-muted text-foreground hover:shadow-sm ${isCompact ? "justify-center px-0 gap-0" : "justify-start gap-3 pl-[14px] pr-3"}`}
          >
            <span className="relative flex items-center justify-center w-5">
              <i className={`${isDark ? "fas fa-sun" : "fas fa-moon"} text-base text-muted-foreground group-hover:text-amber-500 transition-all duration-200`}></i>
            </span>
            {!isCompact && (
              <span className="text-[13px] font-medium">{isDark ? t("sidebar.theme.light") : t("sidebar.theme.dark")}</span>
            )}
            {isCompact && (
              <span className="absolute left-full ml-4 px-3 py-1.5 bg-foreground text-background text-xs font-medium rounded-lg opacity-0 invisible pointer-events-none group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 shadow-xl">
                {isDark ? t("sidebar.theme.light") : t("sidebar.theme.dark")}
                <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-foreground"></span>
              </span>
            )}
          </button>
        </div>

        <div className={`px-4 py-3 ${isCompact ? "text-center" : ""}`}>
          <p className="text-[10px] text-muted-foreground font-medium">
            {isCompact ? "©" : "© 2025"}
          </p>
        </div>
      </div>
    </aside>
  );
}
