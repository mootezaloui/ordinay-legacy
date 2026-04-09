import { useEffect, useLayoutEffect, useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import PageLayout from '../components/layout/PageLayout';
import PageHeader from '../components/layout/PageHeader';
import SettingsGeneral from '../components/settings/SettingsGeneral';
import SettingsWorkspace from '../components/settings/SettingsWorkspace';
import SettingsNotifications from '../components/settings/SettingsNotifications';
import SettingsAgent from '../components/settings/SettingsAgent';
import SettingsSecurityAccess from '../components/settings/SettingsSecurityAccess';
import SettingsAdvanced from '../components/settings/SettingsAdvanced';
import SettingsUpdates from '../components/settings/SettingsUpdates';
import SettingsReferrals from '../components/settings/SettingsReferrals';
import { useLocation } from 'react-router-dom';

export default function Settings() {
  const { t } = useTranslation(['settings']);
  const location = useLocation();
  const SETTINGS_DOMAINS = [
    {
      id: 'general',
      label: t('domains.general.label'),
      description: t('domains.general.description'),
      component: SettingsGeneral,
    },
    {
      id: 'workspace',
      label: t('domains.workspace.label'),
      description: t('domains.workspace.description'),
      component: SettingsWorkspace,
    },
    {
      id: 'agent',
      label: t('domains.agent.label'),
      description: t('domains.agent.description'),
      component: SettingsAgent,
    },
    {
      id: 'notifications',
      label: t('domains.notifications.label'),
      description: t('domains.notifications.description'),
      component: SettingsNotifications,
    },
    {
      id: 'security',
      label: t('domains.security.label'),
      description: t('domains.security.description'),
      component: SettingsSecurityAccess,
    },
    {
      id: 'updates',
      label: t('domains.updates.label'),
      description: t('domains.updates.description'),
      component: SettingsUpdates,
    },
    {
      id: 'referrals',
      label: t('domains.referrals.label'),
      description: t('domains.referrals.description'),
      component: SettingsReferrals,
    },
    {
      id: 'advanced',
      label: t('domains.advanced.label'),
      description: t('domains.advanced.description'),
      component: SettingsAdvanced,
      isAdvanced: true,
    },
  ];
  const [activeDomainId, setActiveDomainId] = useState(SETTINGS_DOMAINS[0].id);

  // ── Animated indicator logic ──
  const navContainerRef = useRef(null);
  const itemRefs = useRef({});
  const indicatorRef = useRef(null);
  const headerPanelRef = useRef(null);
  const contentPanelRef = useRef(null);
  const lastIndicatorY = useRef(null);
  const lastIndicatorH = useRef(null);

  const measureActive = useCallback(() => {
    const container = navContainerRef.current;
    if (!container || !activeDomainId) return null;

    const activeEl = itemRefs.current[activeDomainId];
    if (!activeEl) return null;

    const containerRect = container.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();

    return {
      y: activeRect.top - containerRect.top + container.scrollTop,
      h: activeRect.height,
    };
  }, [activeDomainId]);

  const updateIndicator = useCallback(() => {
    const indicator = indicatorRef.current;
    if (!indicator) return;

    // Small delay to ensure DOM is ready and refs are populated
    requestAnimationFrame(() => {
      const target = measureActive();
      if (!target) {
        indicator.style.opacity = "0";
        return;
      }

      // Always set the final position immediately
      indicator.style.transform = `translateY(${target.y}px)`;
      indicator.style.height = `${target.h}px`;
      indicator.style.opacity = "1";

      if (lastIndicatorY.current !== null && Math.abs(lastIndicatorY.current - target.y) > 1) {
        // Animate from old position to new using Web Animations API
        indicator.animate(
          [
            {
              transform: `translateY(${lastIndicatorY.current}px)`,
              height: `${lastIndicatorH.current}px`,
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

      // Store for next update
      lastIndicatorY.current = target.y;
      lastIndicatorH.current = target.h;
    });
  }, [measureActive]);

  useLayoutEffect(() => {
    updateIndicator();
  }, [activeDomainId, updateIndicator]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      const target = measureActive();
      if (!target || !indicatorRef.current) return;
      indicatorRef.current.style.transition = "none";
      indicatorRef.current.style.transform = `translateY(${target.y}px)`;
      indicatorRef.current.style.height = `${target.h}px`;
      lastIndicatorY.current = target.y;
      lastIndicatorH.current = target.h;
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [measureActive]);


  const activeDomain = SETTINGS_DOMAINS.find((domain) => domain.id === activeDomainId) || SETTINGS_DOMAINS[0];
  const ActiveComponent = activeDomain.component;

  const primaryDomains = SETTINGS_DOMAINS.filter((domain) => !domain.isAdvanced);
  const advancedDomains = SETTINGS_DOMAINS.filter((domain) => domain.isAdvanced);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab') || params.get('section');
    if (tab && SETTINGS_DOMAINS.some((domain) => domain.id === tab)) {
      setActiveDomainId(tab);
    }
  }, [location.search]);

  // Smoothly animate the settings layout content (header + panel)
  // when switching sections, without animating list items.
  useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    const animateNode = (node, keyframes, options) => {
      if (!node || typeof node.animate !== "function") return;
      node.animate(keyframes, options);
    };

    requestAnimationFrame(() => {
      animateNode(
        headerPanelRef.current,
        [
          { opacity: 0, transform: "translateY(6px)" },
          { opacity: 1, transform: "translateY(0px)" },
        ],
        {
          duration: 180,
          easing: "cubic-bezier(0.2, 0, 0, 1)",
          fill: "both",
        },
      );

      animateNode(
        contentPanelRef.current,
        [
          { opacity: 0, transform: "translateY(10px) scale(0.995)" },
          { opacity: 1, transform: "translateY(0px) scale(1)" },
        ],
        {
          duration: 240,
          easing: "cubic-bezier(0.2, 0, 0, 1)",
          fill: "both",
        },
      );
    });
  }, [activeDomainId]);

  return (
    <PageLayout>
      <PageHeader
        title={t('page.title')}
        subtitle={t('page.subtitle')}
        icon="fas fa-cog"
      />

      <div className="flex flex-col lg:flex-row gap-6">
        <nav ref={navContainerRef} className="lg:w-64 flex-shrink-0 relative">
          {/* ── Animated Sliding Indicator ── */}
          <div
            ref={indicatorRef}
            className="absolute left-0 right-0 rounded-xl pointer-events-none z-0 hidden lg:block"
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

          {/* Mobile selector */}
          <div className="lg:hidden mb-4">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
              {t("page.selectSection", { defaultValue: "Select section" })}
            </label>
            <select
              value={activeDomainId}
              onChange={(e) => setActiveDomainId(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              {SETTINGS_DOMAINS.map((domain) => (
                <option key={domain.id} value={domain.id}>
                  {domain.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              {activeDomain.description}
            </p>
          </div>

          <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
            {primaryDomains.map((domain) => {
              const isActive = domain.id === activeDomainId;
              return (
                <button
                  key={domain.id}
                  ref={(el) => (itemRefs.current[domain.id] = el)}
                  onClick={() => setActiveDomainId(domain.id)}
                  className={`hidden lg:block min-w-[160px] lg:min-w-0 px-4 py-3 rounded-xl border text-left transition-[border-color,color,box-shadow,background-color] duration-180 z-[1] relative ${
                    isActive
                      ? 'border-transparent text-white'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-blue-400 hover:shadow-sm'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="block text-sm font-semibold">{domain.label}</span>
                  <span
                    className={`hidden lg:block text-xs mt-1 transition-colors duration-200 ${
                      isActive ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {domain.description}
                  </span>
                </button>
              );
            })}
          </div>

          {advancedDomains.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                {t('domains.advanced.groupLabel')}
              </div>
              <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
                {advancedDomains.map((domain) => {
                  const isActive = domain.id === activeDomainId;
                  return (
                    <button
                      key={domain.id}
                      ref={(el) => (itemRefs.current[domain.id] = el)}
                      onClick={() => setActiveDomainId(domain.id)}
                      className={`hidden lg:block min-w-[160px] lg:min-w-0 px-4 py-3 rounded-xl border text-left transition-[border-color,color,box-shadow,background-color] duration-180 z-[1] relative ${
                        isActive
                          ? 'border-transparent text-white'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-blue-400 hover:shadow-sm'
                      }`}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <span className="block text-sm font-semibold">{domain.label}</span>
                      <span
                        className={`hidden lg:block text-xs mt-1 transition-colors duration-200 ${
                          isActive ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {domain.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </nav>

        <section className="flex-1 space-y-6">
          <div ref={headerPanelRef} className="px-1">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
              {activeDomain.label}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {activeDomain.description}
            </p>
          </div>

          <div ref={contentPanelRef}>
            <ActiveComponent />
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
