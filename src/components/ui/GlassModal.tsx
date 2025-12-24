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
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200"
      style={{
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop Dimming Layer */}
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60"></div>

      {/* Floating Glass Sheet Modal */}
      <div
        className={`relative bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl ${maxWidthClass} w-full max-h-[85vh] flex flex-col animate-in zoom-in-95 duration-300`}
        style={{
          boxShadow:
            '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    modalRoot
  );
}
