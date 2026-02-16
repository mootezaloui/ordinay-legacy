/**
 * SkeletonPulse — Base skeleton loading primitive.
 * Renders a pulsing placeholder block sized via Tailwind className.
 */
const SkeletonPulse = ({ className = "" }) => (
  <div className={`skeleton-pulse rounded ${className}`} />
);

export default SkeletonPulse;
