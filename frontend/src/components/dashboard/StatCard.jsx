/**
 * StatCard Component
 * Reusable stat card with icon, value, label, and trend indicator
 */
export default function StatCard({ 
  label, 
  value, 
  icon, 
  trend, 
  trendLabel,
  color = "blue",
  onClick 
}) {
  const colors = {
    blue: {
      bg: "bg-blue-100 dark:bg-blue-900/20",
      icon: "text-blue-600 dark:text-blue-400",
      trend: "text-blue-600 dark:text-blue-400"
    },
    purple: {
      bg: "bg-purple-100 dark:bg-purple-900/20",
      icon: "text-purple-600 dark:text-purple-400",
      trend: "text-purple-600 dark:text-purple-400"
    },
    amber: {
      bg: "bg-amber-100 dark:bg-amber-900/20",
      icon: "text-amber-600 dark:text-amber-400",
      trend: "text-amber-600 dark:text-amber-400"
    },
    green: {
      bg: "bg-green-100 dark:bg-green-900/20",
      icon: "text-green-600 dark:text-green-400",
      trend: "text-green-600 dark:text-green-400"
    },
    red: {
      bg: "bg-red-100 dark:bg-red-900/20",
      icon: "text-red-600 dark:text-red-400",
      trend: "text-red-600 dark:text-red-400"
    },
  };

  const colorScheme = colors[color] || colors.blue;
  const isPositive = trend > 0;
  const isNegative = trend < 0;

  return (
    <div 
      className={`p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 hover:shadow-lg transition-all duration-200 ${
        onClick ? 'cursor-pointer hover:scale-105' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">
            {value}
          </p>
        </div>
        <div className={`p-3 ${colorScheme.bg} rounded-lg flex-shrink-0`}>
          <i className={`${icon} ${colorScheme.icon} text-xl`}></i>
        </div>
      </div>
      
      {(trend !== undefined || trendLabel) && (
        <div className="mt-4 flex items-center gap-2">
          {trend !== undefined && (
            <>
              <i className={`fas fa-arrow-${isPositive ? 'up' : isNegative ? 'down' : 'right'} text-xs ${
                isPositive ? 'text-green-600 dark:text-green-400' : 
                isNegative ? 'text-red-600 dark:text-red-400' : 
                'text-slate-400'
              }`}></i>
              <span className={`text-sm font-medium ${
                isPositive ? 'text-green-600 dark:text-green-400' : 
                isNegative ? 'text-red-600 dark:text-red-400' : 
                'text-slate-500 dark:text-slate-400'
              }`}>
                {Math.abs(trend)}%
              </span>
            </>
          )}
          {trendLabel && (
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {trendLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
