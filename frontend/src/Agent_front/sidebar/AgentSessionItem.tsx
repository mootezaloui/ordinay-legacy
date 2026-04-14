import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquare, MoreVertical, Edit2, Trash2, GripVertical, Check, X } from "lucide-react";
import { AgentSession } from "../types/agentSession";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AgentSessionItemProps {
  session: AgentSession;
  active: boolean;
  onClick: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  getRelativeTime: (timestamp: Date) => string;
  registerRef?: (el: HTMLDivElement | null) => void;
  isDragging?: boolean;
  isDropTarget?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

export function AgentSessionItem({
  session,
  active,
  onClick,
  onRename,
  onDelete,
  getRelativeTime,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  registerRef,
}: AgentSessionItemProps) {
  const { t } = useTranslation("common");
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(session.title);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    setEditValue(session.title);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== session.title) {
      onRename(trimmed);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditValue(session.title);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveEdit();
    } else if (e.key === "Escape") {
      handleCancelEdit();
    }
  };

  const handleConfirmDelete = () => {
    setShowDeleteDialog(false);
    onDelete();
  };

  return (
    <>
      <div
        ref={(el) => registerRef?.(el)}
        draggable={!isEditing}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={!isEditing ? onClick : undefined}
        className={`group relative z-[1] p-3 rounded-2xl cursor-pointer border border-transparent hover:scale-[1.02] hover:shadow-sm transition-all duration-200 ${
          isDragging ? "opacity-50 shadow-lg" : ""
        } ${
          isDropTarget ? "ring-2 ring-slate-300/50 dark:ring-slate-600/50 ring-inset" : ""
        } ${
          active ? "agent-session-active" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div
              className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-0.5 -ml-1 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] rounded transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <MessageSquare
              className={`w-3.5 h-3.5 flex-shrink-0 ${
                active ? "text-slate-700 dark:text-slate-200" : "text-slate-400"
              }`}
            />
            {isEditing ? (
              <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
                <input
                  ref={inputRef}
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={handleSaveEdit}
                  aria-label={t("agent.session.titleAria")}
                  className="flex-1 min-w-0 text-sm font-medium bg-white/90 dark:bg-[#1e293b]/70 border border-black/[0.06] dark:border-white/[0.06] rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-slate-400/20"
                />
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  title={t("agent.session.save")}
                  className="p-0.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded-full"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  title={t("agent.session.cancel")}
                  className="p-0.5 hover:bg-rose-100 dark:hover:bg-rose-900/30 rounded-full"
                >
                  <X className="w-3.5 h-3.5 text-rose-600" />
                </button>
              </div>
            ) : (
              <h4
                className={`text-sm font-medium truncate ${
                  active
                    ? "text-[#0f172a] dark:text-[#f1f5f9]"
                    : "text-[#0f172a] dark:text-[#f1f5f9]"
                }`}
              >
                {session.title}
              </h4>
            )}
          </div>
          {!isEditing && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  title={t("agent.session.moreOptions")}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] rounded-full transition-all"
                >
                  <MoreVertical className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="end"
                sideOffset={6}
                collisionPadding={8}
                className="w-40 max-h-none overflow-y-visible bg-white/95 dark:bg-[#1e293b]/95 border border-black/[0.06] dark:border-white/[0.06] shadow-xl rounded-2xl z-50"
              >
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleStartEdit(); }}>
                  <Edit2 className="w-3.5 h-3.5 mr-2" />
                  {t("agent.session.rename")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); setShowDeleteDialog(true); }}
                  className="text-red-600 dark:text-red-400 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/20"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  {t("agent.session.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mb-1 ml-5">
          {session.lastMessage || t("agent.session.noMessagesYet")}
        </p>
        <div className="flex items-center justify-between text-[11px] text-slate-400 ml-5">
          <span>{t("agent.session.messagesCount", { count: session.messageCount })}</span>
          <span>{getRelativeTime(session.timestamp)}</span>
        </div>
      </div>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t("agent.session.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("agent.session.deleteConfirm", { title: session.title })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <button
              type="button"
              onClick={() => setShowDeleteDialog(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white/80 dark:bg-[#0f172a]/60 hover:bg-white dark:hover:bg-[#1e293b] rounded-full border border-black/[0.05] dark:border-white/[0.06] transition-colors"
            >
              {t("agent.session.cancel")}
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-full transition-colors"
            >
              {t("agent.session.delete")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
