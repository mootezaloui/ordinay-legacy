import ContentSection from "../../layout/ContentSection";

/**
 * Financials Tab - Displays financial information
 * Works for dossiers with financial data
 */
export default function FinancialsTab({ data, config }) {
  const financials = config.getFinancials ? config.getFinancials(data) : null;

  if (!financials) {
    return (
      <ContentSection title="Informations Financières">
        <div className="p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
            <i className="fas fa-dollar-sign text-slate-400 dark:text-slate-600 text-2xl"></i>
          </div>
          <p className="text-slate-600 dark:text-slate-400">
            Aucune information financière
          </p>
        </div>
      </ContentSection>
    );
  }

  const cards = [
    {
      label: "Total honoraires",
      value: financials.totalFees,
      color: "blue",
      bgColor: "bg-blue-100 dark:bg-blue-900/20",
      textColor: "text-blue-600 dark:text-blue-400",
    },
    {
      label: "Montant payé",
      value: financials.paidAmount,
      color: "green",
      bgColor: "bg-green-100 dark:bg-green-900/20",
      textColor: "text-green-600 dark:text-green-400",
    },
    {
      label: "Montant en attente",
      value: financials.pendingAmount,
      color: "amber",
      bgColor: "bg-amber-100 dark:bg-amber-900/20",
      textColor: "text-amber-600 dark:text-amber-400",
    },
    {
      label: "Frais engagés",
      value: financials.expenses,
      color: "purple",
      bgColor: "bg-purple-100 dark:bg-purple-900/20",
      textColor: "text-purple-600 dark:text-purple-400",
    },
  ];

  return (
    <ContentSection title="Informations Financières">
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card, index) => (
            <div
              key={index}
              className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                {card.label}
              </p>
              <p className={`text-2xl font-bold ${card.textColor}`}>
                {card.value}
              </p>
            </div>
          ))}
        </div>

        {/* Additional financial details can be added here */}
        <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
          <h4 className="font-semibold text-slate-900 dark:text-white mb-3">
            Résumé
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400">Total facturé:</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {financials.totalFees}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400">Déjà payé:</span>
              <span className="font-medium text-green-600 dark:text-green-400">
                {financials.paidAmount}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400">Reste à payer:</span>
              <span className="font-medium text-amber-600 dark:text-amber-400">
                {financials.pendingAmount}
              </span>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
              <span className="text-slate-600 dark:text-slate-400">Frais annexes:</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {financials.expenses}
              </span>
            </div>
          </div>
        </div>
      </div>
    </ContentSection>
  );
}