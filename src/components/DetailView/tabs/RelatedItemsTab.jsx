import { Link } from "react-router-dom";
import ContentSection from "../../layout/ContentSection";
import { getStatusColor } from "../../../utils/mockData";

/**
 * RelatedItems Tab - Displays related items (dossiers, invoices, tasks, etc.)
 * Configured via tab config in entity configuration
 */
export default function RelatedItemsTab({ data, config, tabConfig }) {
  const items = data[tabConfig.itemsKey] || [];

  if (items.length === 0) {
    return (
      <ContentSection title={tabConfig.label}>
        <div className="p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
            <i className={`${tabConfig.icon} text-slate-400 dark:text-slate-600 text-2xl`}></i>
          </div>
          <p className="text-slate-600 dark:text-slate-400">
            {tabConfig.emptyMessage || "Aucun élément"}
          </p>
        </div>
      </ContentSection>
    );
  }

  return (
    <ContentSection title={`${tabConfig.label} (${items.length})`}>
      <div className="divide-y divide-slate-200 dark:border-slate-700">
        {items.map((item) => {
          const renderedItem = tabConfig.renderItem(item);
          const hasRoute = tabConfig.itemRoute && item.id;

          const ItemWrapper = hasRoute ? Link : 'div';
          const wrapperProps = hasRoute
            ? { to: `${tabConfig.itemRoute}/${item.id}` }
            : {};

          return (
            <ItemWrapper
              key={item.id}
              {...wrapperProps}
              className={`p-6 flex items-center justify-between transition-colors ${
                hasRoute ? 'hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer' : ''
              }`}
            >
              <div className="flex-1">
                <p className="font-semibold text-slate-900 dark:text-white">
                  {renderedItem.title}
                </p>
                {renderedItem.subtitle && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    {renderedItem.subtitle}
                  </p>
                )}
              </div>
              
              <div className="flex items-center gap-3">
                {renderedItem.extra && (
                  <span className="text-lg font-bold text-slate-900 dark:text-white">
                    {renderedItem.extra}
                  </span>
                )}
                {renderedItem.status && (
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(renderedItem.status)}`}>
                    {renderedItem.status}
                  </span>
                )}
                {hasRoute && (
                  <i className="fas fa-chevron-right text-slate-400"></i>
                )}
              </div>
            </ItemWrapper>
          );
        })}
      </div>
    </ContentSection>
  );
}