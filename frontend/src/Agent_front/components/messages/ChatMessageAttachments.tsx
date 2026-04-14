import { useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Image as ImageIcon, Paperclip } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MessageAttachment } from "../../types/agentMessage";

type ChatAttachmentVariant = "user" | "neutral";

interface ChatMessageAttachmentsProps {
  attachments: MessageAttachment[];
  variant?: ChatAttachmentVariant;
  className?: string;
}

function getFileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "";
  return name.slice(dot + 1).toLowerCase();
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getExtensionBadge(extension: string): string {
  return extension ? extension.toUpperCase() : "FILE";
}

function getIconTone(extension: string, isUserVariant: boolean) {
  if (isUserVariant) {
    if (["pdf"].includes(extension)) return "text-rose-200";
    if (["doc", "docx"].includes(extension)) return "text-blue-200";
    if (["xls", "xlsx", "csv"].includes(extension)) return "text-emerald-200";
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(extension))
      return "text-violet-200";
    if (["zip", "rar", "7z"].includes(extension)) return "text-amber-200";
    return "text-slate-100";
  }

  if (["pdf"].includes(extension)) return "text-red-600 dark:text-red-400";
  if (["doc", "docx"].includes(extension)) return "text-blue-600 dark:text-blue-400";
  if (["xls", "xlsx", "csv"].includes(extension)) return "text-emerald-600 dark:text-emerald-400";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(extension)) return "text-violet-600 dark:text-violet-400";
  if (["zip", "rar", "7z"].includes(extension)) return "text-amber-600 dark:text-amber-400";
  return "text-slate-600 dark:text-slate-300";
}

function getAttachmentIcon(att: MessageAttachment, extension: string) {
  if (att.type === "image") return <ImageIcon className="w-4 h-4" />;
  if (att.type === "document") return <FileText className="w-4 h-4" />;
  return extension ? <FileText className="w-4 h-4" /> : <Paperclip className="w-4 h-4" />;
}

export function ChatMessageAttachments({
  attachments,
  variant = "user",
  className = "",
}: ChatMessageAttachmentsProps) {
  const { t } = useTranslation("common");
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const isUserVariant = variant === "user";

  return (
    <>
      <div className={`mb-2 space-y-2 ${className}`.trim()}>
        {attachments.map((att) => {
          const extension = getFileExtension(att.name);
          const iconTone = getIconTone(extension, isUserVariant);
          const sizeLabel = formatFileSize(att.size);
          const imageContainerClass = isUserVariant
            ? "block rounded-xl overflow-hidden border border-white/25 hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-blue-300/50"
            : "block rounded-xl overflow-hidden border border-slate-200/70 dark:border-slate-700/60 hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-blue-500/40";
          const cardClass = isUserVariant
            ? "group flex items-start gap-3 rounded-xl border p-3 w-[260px] transition-colors bg-white/[0.08] border-white/[0.2] text-slate-100"
            : "group flex items-start gap-3 rounded-xl border p-3 w-[260px] transition-colors bg-white dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100";
          const iconTileClass = isUserVariant
            ? "p-2.5 rounded-lg flex-shrink-0 bg-white/[0.12] border border-white/[0.2]"
            : "p-2.5 rounded-lg flex-shrink-0 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600";
          const sizeClass = isUserVariant
            ? "text-[11px] text-slate-200/75"
            : "text-[11px] text-slate-500 dark:text-slate-400";
          const badgeClass = isUserVariant
            ? "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-white/[0.16] text-slate-100"
            : "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300";

          if (att.type === "image" && att.preview) {
            return (
              <button
                key={att.id}
                type="button"
                className={imageContainerClass}
                onClick={() => setExpandedImage(att.preview || null)}
                aria-label={t("agent.attachments.view", { name: att.name })}
              >
                <img
                  src={att.preview}
                  alt={att.name}
                  className="max-w-[260px] max-h-[190px] object-cover"
                />
              </button>
            );
          }

          return (
            <div
              key={att.id}
              className={cardClass}
            >
              <div className={iconTileClass}>
                <div className={iconTone}>{getAttachmentIcon(att, extension)}</div>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate">{att.name}</p>
                <div className="mt-1 flex items-center gap-2">
                  {sizeLabel && <span className={sizeClass}>{sizeLabel}</span>}
                  <span className={badgeClass}>
                    {getExtensionBadge(extension)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {expandedImage &&
        createPortal(
          <div
            className="agent-modal-overlay"
            onClick={() => setExpandedImage(null)}
            onKeyDown={(e) => e.key === "Escape" && setExpandedImage(null)}
            role="dialog"
            aria-label="Image preview"
          >
            <img
              src={expandedImage}
              alt="Expanded preview"
              className="max-w-[90vw] max-h-[85vh] object-contain rounded-2xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
