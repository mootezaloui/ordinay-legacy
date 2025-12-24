/**
 * LoadingScreen.jsx
 * Modern loading component with smooth Tailwind CSS animations
 */

const LoadingScreen = ({
  variant = 'page',
  message = 'Chargement des données...',
  className = ''
}) => {

  // Variant 1: Smooth rotating gradient spinner
  const GradientSpinner = ({ size = 'md' }) => {
    const sizeClasses = {
      sm: 'h-8 w-8',
      md: 'h-12 w-12',
      lg: 'h-16 w-16'
    };

    return (
      <div className="relative inline-flex">
        <div
          className={`${sizeClasses[size]} animate-spin rounded-full bg-gradient-to-tr from-blue-500 via-blue-600 to-blue-400 opacity-75`}
          style={{
            maskImage: 'radial-gradient(farthest-side, transparent 75%, black 76%)',
            WebkitMaskImage: 'radial-gradient(farthest-side, transparent 75%, black 76%)'
          }}
        />
        <div className={`${sizeClasses[size]} absolute inset-0 animate-pulse rounded-full bg-blue-500/20`} />
      </div>
    );
  };

  // Variant 2: Pulsing dots sequence
  const PulsingDots = () => (
    <div className="flex items-center justify-center space-x-2">
      <div className="h-3 w-3 animate-bounce rounded-full bg-blue-600 dark:bg-blue-400" style={{ animationDelay: '0ms' }}></div>
      <div className="h-3 w-3 animate-bounce rounded-full bg-blue-600 dark:bg-blue-400" style={{ animationDelay: '150ms' }}></div>
      <div className="h-3 w-3 animate-bounce rounded-full bg-blue-600 dark:bg-blue-400" style={{ animationDelay: '300ms' }}></div>
    </div>
  );

  // Variant 3: Modern circle spinner
  const CircleSpinner = ({ size = 'md' }) => {
    const sizeClasses = {
      sm: 'h-6 w-6 border-2',
      md: 'h-10 w-10 border-3',
      lg: 'h-14 w-14 border-4'
    };

    return (
      <div className="relative inline-flex">
        <div
          className={`${sizeClasses[size]} animate-spin rounded-full border-blue-600/30 dark:border-blue-400/30 border-t-blue-600 dark:border-t-blue-400`}
        />
      </div>
    );
  };

  // Variant 4: Wave loader
  const WaveLoader = () => (
    <div className="flex items-end justify-center space-x-1">
      <div className="h-8 w-1.5 animate-pulse rounded-full bg-blue-600 dark:bg-blue-400" style={{ animationDelay: '0ms', animationDuration: '1s' }}></div>
      <div className="h-12 w-1.5 animate-pulse rounded-full bg-blue-600 dark:bg-blue-400" style={{ animationDelay: '150ms', animationDuration: '1s' }}></div>
      <div className="h-16 w-1.5 animate-pulse rounded-full bg-blue-600 dark:bg-blue-400" style={{ animationDelay: '300ms', animationDuration: '1s' }}></div>
      <div className="h-12 w-1.5 animate-pulse rounded-full bg-blue-600 dark:bg-blue-400" style={{ animationDelay: '450ms', animationDuration: '1s' }}></div>
      <div className="h-8 w-1.5 animate-pulse rounded-full bg-blue-600 dark:bg-blue-400" style={{ animationDelay: '600ms', animationDuration: '1s' }}></div>
    </div>
  );

  // Render based on variant
  switch (variant) {
    case 'page':
      return (
        <div className={`flex min-h-[400px] flex-col items-center justify-center py-12 ${className}`}>
          <div className="text-center">
            {/* Main spinner */}
            <div className="mb-8 flex justify-center">
              <GradientSpinner size="lg" />
            </div>

            {/* Decorative dots */}
            <div className="mb-6">
              <PulsingDots />
            </div>

            {/* Message */}
            {message && (
              <p className="text-base font-medium text-slate-600 dark:text-slate-400">
                {message}
              </p>
            )}
          </div>
        </div>
      );

    case 'inline':
      return (
        <div className={`flex items-center justify-center py-8 ${className}`}>
          <div className="text-center">
            <div className="mb-4 flex justify-center">
              <GradientSpinner size="md" />
            </div>
            {message && (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {message}
              </p>
            )}
          </div>
        </div>
      );

    case 'dots':
      return (
        <div className={`flex flex-col items-center justify-center py-8 ${className}`}>
          <PulsingDots />
          {message && (
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
              {message}
            </p>
          )}
        </div>
      );

    case 'wave':
      return (
        <div className={`flex flex-col items-center justify-center py-8 ${className}`}>
          <WaveLoader />
          {message && (
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
              {message}
            </p>
          )}
        </div>
      );

    case 'minimal':
      return (
        <div className={`flex items-center justify-center space-x-2 ${className}`}>
          <CircleSpinner size="sm" />
          {message && (
            <span className="text-sm text-slate-600 dark:text-slate-400">{message}</span>
          )}
        </div>
      );

    case 'button':
      return (
        <div className={`flex items-center justify-center ${className}`}>
          <CircleSpinner size="sm" />
        </div>
      );

    default:
      return null;
  }
};

export default LoadingScreen;
