/**
 * ClientNotificationPrompt Component
 *
 * User consent dialog for client notifications
 * Appears AFTER successful action
 * User explicitly chooses whether to notify client
 * Shows email preview
 * Non-blocking (can be dismissed)
 */

import React, { useState } from 'react';
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

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50 flex items-stretch md:items-center justify-center p-0 md:p-4 pt-[var(--titlebar-height)] md:pt-[calc(var(--titlebar-height)+16px)]"
        onClick={handleDecline}
      >
        {/* Modal */}
        <div
          className="bg-white dark:bg-slate-800 rounded-none md:rounded-lg shadow-xl w-full h-full md:h-auto md:max-w-2xl md:max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
          data-tutorial="client-notification-modal"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {t('clientEmail.modal.title')}
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {t('clientEmail.modal.description')}
                </p>
              </div>
            </div>
            <button
              onClick={handleDecline}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              disabled={isSending}
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4 overflow-y-auto overscroll-contain flex-1 min-h-0 md:max-h-[60vh]">
            {/* Client Info */}
            {emailPreview && (
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {t('clientEmail.modal.recipient')}
                    </p>
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      {emailPreview.clientName}
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      {emailPreview.clientEmail}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowPreview(!showPreview)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
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
                  <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
                    <div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">
                        {t('clientEmail.modal.subject')}
                      </p>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {emailPreview.subject}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">
                        {t('clientEmail.modal.message')}
                      </p>
                      <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                        <pre className="text-sm text-slate-900 dark:text-slate-100 whitespace-pre-wrap font-sans">
                          {emailPreview.body}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Information Note */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-900 dark:text-blue-100 break-words whitespace-normal">
                {t('clientEmail.modal.infoMessage')}
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 p-6 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
            <button
              onClick={handleDecline}
              disabled={isSending}
              className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('clientEmail.modal.actions.decline')}
            </button>
            <button
              onClick={handleConfirm}
              disabled={isSending}
              className="w-full sm:w-auto flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed justify-center"
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
    </>
  );
}
