import PageLayout from "../components/layout/PageLayout";
import PageHeader from "../components/layout/PageHeader";
import ContentSection from "../components/layout/ContentSection";

export default function ComingSoonAI() {
  return (
    <PageLayout>
      <PageHeader
        title="Assistant IA"
        subtitle="Assistant juridique intelligent"
        icon="fas fa-robot"
      />

      <ContentSection>
        <div className="flex flex-col items-center justify-center py-20 px-6">
          <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
            <i className="fas fa-robot text-white text-4xl"></i>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Assistant IA Juridique
          </h2>

          <p className="text-slate-600 dark:text-slate-400 text-center max-w-md mb-8">
            Votre assistant intelligent pour vous aider avec vos questions juridiques,
            recherches de jurisprudence, et analyses de dossiers.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-3xl mb-8">
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <i className="fas fa-search text-blue-600 dark:text-blue-400 text-xl mb-2"></i>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
                Recherche
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Recherchez des jurisprudences et textes de loi
              </p>
            </div>

            <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <i className="fas fa-file-alt text-purple-600 dark:text-purple-400 text-xl mb-2"></i>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
                Analyse
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Analysez des documents juridiques
              </p>
            </div>

            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <i className="fas fa-lightbulb text-green-600 dark:text-green-400 text-xl mb-2"></i>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
                Conseil
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Obtenez des conseils juridiques instantanés
              </p>
            </div>
          </div>

          <div className="px-6 py-3 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-medium bg-slate-50 dark:bg-slate-900/40">
            Disponible prochainement
          </div>

          <p className="mt-8 text-xs text-slate-500 dark:text-slate-400">
            🔒 Toutes les conversations seront sécurisées et confidentielles
          </p>
        </div>
      </ContentSection>
    </PageLayout>
  );
}
