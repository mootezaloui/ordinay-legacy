/**
 * LoadingScreen.jsx
 *
 * Unified loading component using Organia brand identity.
 * Wraps OrganiaDataLoader for backward compatibility.
 *
 * Variants:
 * - page: Full content area loader (default)
 * - inline: Small inline loader with text
 * - card: Loader for card/panel content areas
 * - dots: Animated dots sequence
 * - minimal: Small inline spinner
 * - button: Tiny spinner for button states
 */

import OrganiaDataLoader, {
  PageLoader,
  InlineLoader,
  ButtonLoader,
} from '../brand/OrganiaDataLoader';

const LoadingScreen = ({
  variant = 'page',
  message = 'Loading...',
  size = 'md',
  className = ''
}) => {
  // Map legacy variants to new component
  switch (variant) {
    case 'page':
      return (
        <PageLoader
          message={message}
          className={className}
        />
      );

    case 'inline':
      return (
        <InlineLoader
          message={message}
          size={size}
          className={className}
        />
      );

    case 'card':
      return (
        <OrganiaDataLoader
          variant="card"
          message={message}
          size={size}
          className={className}
        />
      );

    case 'dots':
      return (
        <OrganiaDataLoader
          variant="dots"
          message={message}
          size={size}
          className={className}
        />
      );

    case 'minimal':
      return (
        <InlineLoader
          message={message}
          size="sm"
          className={className}
        />
      );

    case 'button':
      return (
        <ButtonLoader
          size="sm"
          className={className}
        />
      );

    case 'wave':
      // Wave variant mapped to dots for brand consistency
      return (
        <OrganiaDataLoader
          variant="dots"
          message={message}
          size={size}
          className={className}
        />
      );

    default:
      return (
        <PageLoader
          message={message}
          className={className}
        />
      );
  }
};

export default LoadingScreen;

// Re-export branded components for direct use
export {
  OrganiaDataLoader,
  PageLoader,
  InlineLoader,
  ButtonLoader,
};
