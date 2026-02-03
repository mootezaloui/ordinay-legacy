import { useState, useRef, useEffect } from "react";
import { FolderOpen, Folder, ChevronRight, ChevronDown, MoreVertical, Edit2, Trash2, GripVertical, Check, X } from "lucide-react";
import { AgentFolder } from "../types/agentSession";
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

interface AgentFolderItemProps {
  folder: AgentFolder;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onRename: (title: string) => void;
  onDelete: (moveToRoot: boolean) => void;
  conversationCount: number;
  children?: React.ReactNode;
  // Drag & drop
  isDragging?: boolean;
  isDropTarget?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

export function AgentFolderItem({
  folder,
  isExpanded,
  onToggleExpand,
  onRename,
  onDelete,
  conversationCount,
  children,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: AgentFolderItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(folder.title);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    setEditValue(folder.title);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== folder.title) {
      onRename(trimmed);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditValue(folder.title);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveEdit();
    } else if (e.key === "Escape") {
      handleCancelEdit();
    }
  };

  return (
    <>
      <div
        className={`group transition-all ${isDragging ? "opacity-50" : ""}`}
      >
        {/* Folder header - this is the draggable part and drop target for moving sessions into folder */}
        <div
          draggable={!isEditing}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer border border-transparent hover:border-slate-200/70 dark:hover:border-slate-700/60 hover:bg-white/80 dark:hover:bg-slate-900/60 transition-all ${
            isDropTarget
              ? "border-slate-300/80 dark:border-slate-600/80 bg-white dark:bg-slate-900/70 ring-1 ring-slate-200/70 dark:ring-slate-700/60"
              : ""
          }`}
          onClick={!isEditing ? onToggleExpand : undefined}
        >
          {/* Drag handle */}
          <div
            className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-opacity"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-3.5 h-3.5 text-slate-400" />
          </div>

          {/* Expand/collapse icon */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            className="p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
            )}
          </button>

          {/* Folder icon */}
          {isExpanded ? (
            <FolderOpen className="w-4 h-4 text-slate-500 flex-shrink-0" />
          ) : (
            <Folder className="w-4 h-4 text-slate-500 flex-shrink-0" />
          )}

          {/* Title */}
          {isEditing ? (
            <div className="flex items-center gap-1 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
              <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleSaveEdit}
                aria-label="Folder name"
                className="flex-1 min-w-0 text-sm font-medium bg-white/90 dark:bg-slate-900/70 border border-slate-300/70 dark:border-slate-600/70 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-slate-400/20"
              />
              <button
                type="button"
                onClick={handleSaveEdit}
                title="Save"
                className="p-0.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 rounded-full"
              >
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                title="Cancel"
                className="p-0.5 hover:bg-rose-100 dark:hover:bg-rose-900/30 rounded-full"
              >
                <X className="w-3.5 h-3.5 text-rose-600" />
              </button>
            </div>
          ) : (
            <>
              <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                {folder.title}
              </span>
              <span className="text-[11px] text-slate-400 mr-1">
                {conversationCount}
              </span>
            </>
          )}

          {/* Context menu */}
          {!isEditing && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  title="Folder options"
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all"
                >
                  <MoreVertical className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 bg-white/95 dark:bg-slate-900/95 border border-slate-200/70 dark:border-slate-700/70 shadow-xl rounded-2xl z-50">
                <DropdownMenuItem onClick={handleStartEdit}>
                  <Edit2 className="w-3.5 h-3.5 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-red-600 dark:text-red-400 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/20"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  Delete Folder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Children (conversations) */}
        {isExpanded && children && (
          <div className="ml-4 mt-2 space-y-2 border-l border-slate-200/70 dark:border-slate-700/60 pl-3">
            {children}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Delete Folder</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the folder "{folder.title}"?
              {conversationCount > 0 && (
                <span className="block mt-2">
                  This folder contains <strong>{conversationCount}</strong> conversation{conversationCount !== 1 ? 's' : ''}.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setShowDeleteDialog(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white/80 dark:bg-slate-900/60 hover:bg-white dark:hover:bg-slate-800 rounded-full border border-slate-200/70 dark:border-slate-700/60 transition-colors"
            >
              Cancel
            </button>
            {conversationCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setShowDeleteDialog(false);
                  onDelete(true);
                }}
                className="px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50 rounded-full transition-colors"
              >
                Move to Root & Delete
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setShowDeleteDialog(false);
                onDelete(false);
              }}
              className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-full transition-colors"
            >
              {conversationCount > 0 ? "Delete All" : "Delete"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
