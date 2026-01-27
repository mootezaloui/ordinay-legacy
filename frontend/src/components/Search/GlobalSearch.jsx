import { useState, useEffect, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from "../ui/sheet";
import { useNavigate } from "react-router-dom";
import { searchAllData } from "../../utils/searchUtils";
import { useData } from "../../contexts/DataContext";
import { useTranslation } from "react-i18next";

/**
 * GlobalSearch - Universal search component
 * Adapts to light/dark mode
 */
export default function GlobalSearch() {
  const navigate = useNavigate();
  const { t } = useTranslation("common");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const searchRef = useRef(null);
  const {
    clients,
    dossiers,
    tasks,
    lawsuits,
    sessions,
    officers,
    financialEntries,
  } = useData();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const updateIsMobile = () => {
      setIsMobile(window.matchMedia("(max-width: 767px)").matches);
    };
    updateIsMobile();
    window.addEventListener("resize", updateIsMobile);
    return () => window.removeEventListener("resize", updateIsMobile);
  }, []);

  // Search with debounce
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(() => {
      const searchResults = searchAllData(query, {
        clients,
        dossiers,
        tasks,
        lawsuits,
        sessions,
        officers,
        accounting: financialEntries,
      });
      setResults(searchResults);
      setIsOpen(true);
      setIsLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleResultClick = (type, id) => {
    const routes = {
      client: `/clients/${id}`,
      dossier: `/dossiers/${id}`,
      task: `/tasks/${id}`,
      lawsuit: `/lawsuits/${id}`,
      session: `/sessions/${id}`,
      officer: `/officers/${id}`,
      accounting: `/accounting/${id}`,
    };

    navigate(routes[type] || "/");
    setQuery("");
    setIsOpen(false);
  };

  const getTotalResults = () => {
    if (!results) return 0;
    return Object.values(results).reduce((sum, items) => sum + items.length, 0);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      setIsOpen(false);
      setQuery("");
    }
  };

  const searchInput = (
    <div className="relative">
      <input
        type="text"
        placeholder={t("search.placeholder")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-white dark:bg-slate-900/70 text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 border border-slate-300 dark:border-slate-700/60 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all duration-200 shadow-sm"
      />
      <span className="absolute left-3 top-2.5 text-slate-500 dark:text-slate-400">
        {isLoading ? (
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1111.293 3.707l4 4a1 1 0 01-1.414 1.414l-4-4A6 6 0 012 8z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </span>
      {query && !isLoading && (
        <button
          onClick={() => {
            setQuery("");
            setIsOpen(false);
          }}
          className="absolute right-3 top-2.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );

  const resultsContent = (
    <>
      <div className="px-4 py-3 border-b border-slate-200/70 dark:border-slate-700/60 bg-slate-50/80 dark:bg-slate-800/50">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {getTotalResults() > 0 ? (
              <>
                <i className="fas fa-check-circle text-green-500 mr-2"></i>
                {t("search.results.found", { count: getTotalResults() })}
              </>
            ) : (
              <>
                <i className="fas fa-info-circle text-slate-400 mr-2"></i>
                {t("search.results.none")}
              </>
            )}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {t("search.results.escHint")}
          </span>
        </div>
      </div>

      {getTotalResults() > 0 ? (
        <div className="py-2">
          {results.clients?.length > 0 && (
            <SearchSection
              title={t("search.categories.clients")}
              icon="fas fa-users"
              iconColor="text-blue-600 dark:text-blue-400"
              bgColor="bg-blue-100 dark:bg-blue-900/20"
              items={results.clients}
              onItemClick={(item) => handleResultClick("client", item.id)}
              renderItem={(item) => ({
                title: item.name,
                subtitle: item.email,
                extra: item.phone,
                status: item.status,
              })}
            />
          )}

          {results.dossiers?.length > 0 && (
            <SearchSection
              title={t("search.categories.dossiers")}
              icon="fas fa-folder-open"
              iconColor="text-purple-600 dark:text-purple-400"
              bgColor="bg-purple-100 dark:bg-purple-900/20"
              items={results.dossiers}
              onItemClick={(item) => handleResultClick("dossier", item.id)}
              renderItem={(item) => ({
                title: item.lawsuitNumber,
                subtitle: item.title,
                extra: item.client,
                status: item.status,
              })}
            />
          )}

          {results.tasks?.length > 0 && (
            <SearchSection
              title={t("search.categories.tasks")}
              icon="fas fa-tasks"
              iconColor="text-green-600 dark:text-green-400"
              bgColor="bg-green-100 dark:bg-green-900/20"
              items={results.tasks}
              onItemClick={(item) => handleResultClick("task", item.id)}
              renderItem={(item) => ({
                title: item.title,
                subtitle: `${t("search.assignedTo")} ${item.assignedTo}`,
                extra: item.dueDate,
                status: item.status,
              })}
            />
          )}

          {results.lawsuits?.length > 0 && (
            <SearchSection
              title={t("search.categories.lawsuits")}
              icon="fas fa-gavel"
              iconColor="text-red-600 dark:text-red-400"
              bgColor="bg-red-100 dark:bg-red-900/20"
              items={results.lawsuits}
              onItemClick={(item) => handleResultClick("lawsuit", item.id)}
              renderItem={(item) => ({
                title: item.lawsuitNumber,
                subtitle: item.title,
                extra: item.court,
                status: item.status,
              })}
            />
          )}

          {results.sessions?.length > 0 && (
            <SearchSection
              title={t("search.categories.hearings")}
              icon="fas fa-calendar"
              iconColor="text-amber-600 dark:text-amber-400"
              bgColor="bg-amber-100 dark:bg-amber-900/20"
              items={results.sessions}
              onItemClick={(item) => handleResultClick("session", item.id)}
              renderItem={(item) => ({
                title: item.title,
                subtitle: `${item.date} ${t("search.at")} ${item.time}`,
                extra: item.location,
                status: item.status,
              })}
            />
          )}

          {results.officers?.length > 0 && (
            <SearchSection
              title={t("search.categories.bailiffs")}
              icon="fas fa-user-tie"
              iconColor="text-indigo-600 dark:text-indigo-400"
              bgColor="bg-indigo-100 dark:bg-indigo-900/20"
              items={results.officers}
              onItemClick={(item) => handleResultClick("officer", item.id)}
              renderItem={(item) => ({
                title: item.name,
                subtitle: item.specialization,
                extra: item.phone,
                status: item.status,
              })}
            />
          )}
        </div>
      ) : (
        <div className="py-12 text-center">
          <i className="fas fa-search text-4xl text-slate-300 dark:text-slate-600 mb-3"></i>
          <p className="text-slate-600 dark:text-slate-400">
            {t("search.results.noneFor", { query })}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
            {t("search.results.tryAgain")}
          </p>
        </div>
      )}
    </>
  );

  return (
    <div ref={searchRef} className="relative w-full">
      {/* Search Input - Adapts to light/dark mode */}
      {searchInput}

      {/* Results Dropdown / Mobile Sheet */}
      {isOpen && results && !isMobile && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-700/70 max-h-[600px] overflow-y-auto z-50">
          {resultsContent}
        </div>
      )}

      {isMobile && (
        <Sheet open={isOpen && !!results} onOpenChange={(open) => !open && setIsOpen(false)}>
          <SheetContent side="right" className="w-full sm:max-w-full">
            <SheetHeader className="flex flex-row items-center justify-between">
              <SheetTitle>{t("search.placeholder")}</SheetTitle>
              <SheetClose className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                <i className="fas fa-times"></i>
              </SheetClose>
            </SheetHeader>
            <div className="mt-4 space-y-4">
              {searchInput}
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-700/70 overflow-hidden">
                {resultsContent}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

/**
 * SearchSection - Category section in search results
 */
function SearchSection({ title, icon, iconColor, bgColor, items, onItemClick, renderItem }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const { t } = useTranslation("common");

  return (
    <div className="border-b border-slate-200/70 dark:border-slate-700/60 last:border-b-0">
      {/* Section Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-100/70 dark:hover:bg-slate-800/60 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl ${bgColor} flex items-center justify-center`}>
            <i className={`${icon} text-sm ${iconColor}`}></i>
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {title}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {items.length} {t("search.result", { count: items.length })}
            </p>
          </div>
        </div>
        <i className={`fas fa-chevron-${isExpanded ? "up" : "down"} text-slate-400 text-xs`}></i>
      </button>

      {/* Section Items */}
      {isExpanded && (
        <div className="pb-2">
          {items.map((item) => {
            const rendered = renderItem(item);
            return (
              <button
                key={item.id}
                onClick={() => onItemClick(item)}
                className="w-full px-4 py-3 hover:bg-slate-100/70 dark:hover:bg-slate-800/40 transition-colors text-left group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {rendered.title}
                    </p>
                    {rendered.subtitle && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {rendered.subtitle}
                      </p>
                    )}
                    {rendered.extra && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                        {rendered.extra}
                      </p>
                    )}
                  </div>
                  {rendered.status && (
                    <span className="ml-3 px-2 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded">
                      {rendered.status}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}




