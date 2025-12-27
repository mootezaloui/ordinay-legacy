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
import { generateClientEmail } from '../../services/clientCommunication';

export default function ClientNotificationPrompt({
  isOpen,
  onClose,
  onConfirm,
  eventType,
  eventData,
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [isSending, setIsSending] = useState(false);

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
    await onConfirm();
    setIsSending(false);
  };

  const handleDecline = () => {
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        onClick={handleDecline}
      >
        {/* Modal */}
        <div
          className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Notification Client
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Do you want to notify client about this update ?
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
          <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
            {/* Client Info */}
            {emailPreview && (
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Recipient
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
                        Hide
                      </>
                    ) : (
                      <>
                        <Eye className="w-4 h-4" />
                        Preview
                      </>
                    )}
                  </button>
                </div>

                {/* Email Preview */}
                {showPreview && (
                  <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
                    <div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">
                        Subject
                      </p>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {emailPreview.subject}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">
                        Message
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
                📧 An email will be sent to the client to inform them of this update.
                You can choose not to notify the client if this action is internal.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
            <button
              onClick={handleDecline}
              disabled={isSending}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              No, do not notify
            </button>
            <button
              onClick={handleConfirm}
              disabled={isSending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Yes, send an email
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
