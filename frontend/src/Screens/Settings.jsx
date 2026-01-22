import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PageLayout from '../components/layout/PageLayout';
import PageHeader from '../components/layout/PageHeader';
import SettingsGeneral from '../components/settings/SettingsGeneral';
import SettingsWorkspace from '../components/settings/SettingsWorkspace';
import SettingsNotifications from '../components/settings/SettingsNotifications';
import SettingsDocuments from '../components/settings/SettingsDocuments';
import SettingsSecurityAccess from '../components/settings/SettingsSecurityAccess';
import SettingsAdvanced from '../components/settings/SettingsAdvanced';
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
      id: 'notifications',
      label: t('domains.notifications.label'),
      description: t('domains.notifications.description'),
      component: SettingsNotifications,
    },
    {
      id: 'documents',
      label: t('domains.documents.label'),
      description: t('domains.documents.description'),
      component: SettingsDocuments,
    },
    {
      id: 'security',
      label: t('domains.security.label'),
      description: t('domains.security.description'),
      component: SettingsSecurityAccess,
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

  return (
    <PageLayout>
      <PageHeader
        title={t('page.title')}
        subtitle={t('page.subtitle')}
        icon="fas fa-cog"
      />

      <div className="flex flex-col lg:flex-row gap-6">
        <nav className="lg:w-64 flex-shrink-0">
          <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
            {primaryDomains.map((domain) => {
              const isActive = domain.id === activeDomainId;
              return (
                <button
                  key={domain.id}
                  onClick={() => setActiveDomainId(domain.id)}
                  className={`min-w-[160px] lg:min-w-0 px-4 py-3 rounded-lg border text-left transition-colors ${
                    isActive
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-blue-400'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span className="block text-sm font-semibold">{domain.label}</span>
                  <span
                    className={`hidden lg:block text-xs mt-1 ${
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
                      onClick={() => setActiveDomainId(domain.id)}
                      className={`min-w-[160px] lg:min-w-0 px-4 py-3 rounded-lg border text-left transition-colors ${
                        isActive
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-blue-400'
                      }`}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <span className="block text-sm font-semibold">{domain.label}</span>
                      <span
                        className={`hidden lg:block text-xs mt-1 ${
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
          <div className="px-1">
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
              {activeDomain.label}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {activeDomain.description}
            </p>
          </div>

          <ActiveComponent />
        </section>
      </div>
    </PageLayout>
  );
}
