import { useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface GlassModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl';
}

/**
 * GlassModal - Global viewport-level modal overlay system
 *
 * Architecture:
 * - Renders via React Portal to #modal-root (outside main app container)
 * - Ensures backdrop blur starts from absolute viewport top
 * - Prevents clipping by parent layout containers
 * - True floating overlay with proper z-index layering
 *
 * @param isOpen - Controls modal visibility
 * @param onClose - Callback when modal should close (backdrop click or ESC)
 * @param children - Modal content to render
 * @param maxWidth - Optional max-width (default: '3xl')
 */
export default function GlassModal({
  isOpen,
  onClose,
  children,
  maxWidth = '3xl',
}: GlassModalProps) {
  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot) {
    console.error('GlassModal: #modal-root element not found in DOM');
    return null;
  }

  // Map maxWidth prop to Tailwind class
  const maxWidthClasses: Record<string, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
    '6xl': 'max-w-6xl',
    '7xl': 'max-w-7xl',
  };

  const maxWidthClass = maxWidthClasses[maxWidth];

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 overflow-hidden animate-in fade-in duration-300"
      style={{
        paddingTop: `calc(var(--titlebar-height, 0px) + 16px)`,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop with gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/50 via-slate-800/40 to-slate-900/50 dark:from-black/60 dark:via-slate-900/50 dark:to-black/60" />

      {/* Floating Glass Modal */}
      <div
        className={`relative ${maxWidthClass} w-full flex flex-col animate-in zoom-in-95 slide-in-from-bottom-4 duration-300`}
        style={{
          maxHeight: 'calc(100vh - var(--titlebar-height, 0px) - 48px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glass card with refined styling */}
        <div
          className="relative bg-white dark:bg-slate-900 rounded-2xl overflow-hidden flex flex-col"
          style={{
            maxHeight: 'calc(100vh - var(--titlebar-height, 0px) - 48px)',
            boxShadow: '0 0 0 1px rgba(148, 163, 184, 0.1), 0 24px 48px -12px rgba(0, 0, 0, 0.25), 0 12px 24px -8px rgba(0, 0, 0, 0.15)',
          }}
        >
          {/* Subtle top accent line */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
          {children}
        </div>
      </div>
    </div>,
    modalRoot
  );
}
