/**
 * ClientNotificationPrompt Component
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Mail, Send, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { generateClientEmail } from '../../services/clientCommunication';
import { useNotifications } from '../../contexts/NotificationContext';
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

export default function ClientNotificationPrompt({
  isOpen,
  onClose,
  onConfirm,
  eventType,
  eventData,
}) {
  const { t } = useTranslation('notifications');
  const { addAlert } = useNotifications();
  const [showPreview, setShowPreview] = useState(false);
  const [isSending, setIsSending] = useState(false);
  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  // Generate email preview
  let emailPreview = null;
  try {
    emailPreview = generateClientEmail(eventType, eventData);
  } catch (error) {
    console.error('Error generating email preview:', error);
  }

  const handleConfirm = async () => {
    setIsSending(true);
    const success = await onConfirm();
    setIsSending(false);

    if (success) {
      addAlert({
        type: 'success',
        title: t('clientEmail.toast.success.title', 'Email sent'),
        message: t('clientEmail.toast.success.message', 'The client has been notified.'),
      });
    } else {
      addAlert({
        type: 'warning',
        title: t('clientEmail.toast.failed.title', 'Email not sent'),
        message: t('clientEmail.toast.failed.message', 'The email could not be sent. Please check your email configuration.'),
      });
    }
  };

  const handleDecline = () => {
    onClose();
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[10000] flex items-stretch md:items-center justify-center p-0 md:p-4 pt-[var(--titlebar-height)] md:pt-[calc(var(--titlebar-height)+16px)] animate-in fade-in duration-300"
      onClick={handleDecline}
      style={{
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {/* Backdrop overlay */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Modal */}
      <div
        className="relative bg-white dark:bg-slate-800 rounded-none md:rounded-2xl shadow-2xl w-full h-full md:h-auto md:max-w-2xl md:max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
        onClick={(e) => e.stopPropagation()}
        data-tutorial="client-notification-modal"
        style={{
          boxShadow: '0 0 0 1px rgba(148, 163, 184, 0.1), 0 24px 48px -12px rgba(0, 0, 0, 0.25), 0 12px 24px -8px rgba(0, 0, 0, 0.15)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center ring-4 ring-blue-50 dark:ring-blue-900/20">
              <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {t('clientEmail.modal.title')}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t('clientEmail.modal.description')}
              </p>
            </div>
          </div>
          <button
            onClick={handleDecline}
            className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all text-slate-400 hover:text-slate-600"
            disabled={isSending}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="modal-scroll-stable p-6 space-y-4 overflow-y-auto overscroll-contain flex-1 min-h-0 md:max-h-[60vh]">
          {/* Client Info */}
          {emailPreview && (
            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-5 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider mb-1">
                    {t('clientEmail.modal.recipient')}
                  </p>
                  <p className="text-base font-bold text-slate-900 dark:text-slate-100">
                    {emailPreview.clientName}
                  </p>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    {emailPreview.clientEmail}
                  </p>
                </div>
                <button
                  onClick={() => setShowPreview(!showPreview)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all shadow-sm border border-slate-200 dark:border-slate-700"
                >
                  {showPreview ? (
                    <>
                      <EyeOff className="w-4 h-4" />
                      {t('clientEmail.modal.hide')}
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4" />
                      {t('clientEmail.modal.preview')}
                    </>
                  )}
                </button>
              </div>

              {/* Email Preview */}
              {showPreview && (
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-4">
                  <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
                    <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                      {t('clientEmail.modal.subject')}
                    </p>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {emailPreview.subject}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm">
                    <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                      {t('clientEmail.modal.message')}
                    </p>
                    <pre className="text-sm text-slate-900 dark:text-slate-100 whitespace-pre-wrap font-sans leading-relaxed">
                      {emailPreview.body}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Information Note */}
          <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-4 border border-blue-200 dark:border-blue-800 flex items-start gap-3">
            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-sm text-blue-900 dark:text-blue-100 font-medium leading-relaxed">
              {t('clientEmail.modal.infoMessage')}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 p-6 border-t border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/50">
          <button
            onClick={handleDecline}
            disabled={isSending}
            className="w-full sm:w-auto px-5 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all disabled:opacity-50"
          >
            {t('clientEmail.modal.actions.decline')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSending}
            className="w-full sm:w-auto flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-xl transition-all disabled:opacity-50 justify-center shadow-lg shadow-blue-500/25"
          >
            {isSending ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {t('clientEmail.modal.actions.sending')}
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                {t('clientEmail.modal.actions.confirm')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
