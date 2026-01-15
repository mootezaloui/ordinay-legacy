import { useState, useRef, useEffect } from "react";
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
}: AgentSessionItemProps) {
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
        draggable={!isEditing}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={!isEditing ? onClick : undefined}
        className={`group relative p-3 rounded-lg cursor-pointer transition-all ${
          isDragging ? "opacity-50 shadow-lg" : ""
        } ${
          isDropTarget ? "ring-2 ring-blue-400 ring-inset bg-blue-50 dark:bg-blue-900/20" : ""
        } ${
          active
            ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
            : "hover:bg-slate-50 dark:hover:bg-slate-800"
        }`}
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div
              className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-0.5 -ml-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="w-3.5 h-3.5 text-slate-400" />
            </div>
            <MessageSquare
              className={`w-3.5 h-3.5 flex-shrink-0 ${
                active ? "text-blue-600 dark:text-blue-400" : "text-slate-400"
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
                  aria-label="Conversation title"
                  className="flex-1 min-w-0 text-sm font-medium bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-600 rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  title="Save"
                  className="p-0.5 hover:bg-green-100 dark:hover:bg-green-900/30 rounded"
                >
                  <Check className="w-3.5 h-3.5 text-green-600" />
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  title="Cancel"
                  className="p-0.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                >
                  <X className="w-3.5 h-3.5 text-red-600" />
                </button>
              </div>
            ) : (
              <h4
                className={`text-sm font-medium truncate ${
                  active
                    ? "text-blue-900 dark:text-blue-100"
                    : "text-slate-900 dark:text-white"
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
                  title="More options"
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-all"
                >
                  <MoreVertical className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg z-50">
                <DropdownMenuItem onClick={handleStartEdit}>
                  <Edit2 className="w-3.5 h-3.5 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-red-600 dark:text-red-400 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/20"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mb-1 ml-5">
          {session.lastMessage || "No messages yet"}
        </p>
        <div className="flex items-center justify-between text-xs text-slate-400 ml-5">
          <span>{session.messageCount} messages</span>
          <span>{getRelativeTime(session.timestamp)}</span>
        </div>
      </div>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Conversation</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{session.title}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <button
              type="button"
              onClick={() => setShowDeleteDialog(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
            >
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
