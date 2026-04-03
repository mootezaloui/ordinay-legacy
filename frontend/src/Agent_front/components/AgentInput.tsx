import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  X,
  Plus,
  Paperclip,
  Image,
  FileText,
  Upload,
  Folder,
  Search,
  Check,
  Globe,
} from "lucide-react";
import {
  getSlashCommands,
  filterCommands,
  SlashCommand,
} from "../../services/api/agent";
import { apiClient } from "../../services/api/client";
import { getDocumentFormatGovernance } from "../../services/api/documentFormats";

export interface ContextIndicator {
  type: "client" | "dossier" | "lawsuit" | "session" | "task" | "global";
  label: string;
  id?: number;
}

export interface AttachedFile {
  id: string;
  name: string;
  type: "file" | "document" | "image";
  size?: number;
  preview?: string;
  documentId?: number;
  /** Raw File object for new uploads (not set for existing system documents) */
  file?: File;
}

interface SystemDocument {
  id: number;
  title: string;
  file_path: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  client_id?: number;
  client_name?: string;
  dossier_id?: number;
  dossier_reference?: string;
  lawsuit_id?: number;
  mission_id?: number;
  task_id?: number;
  session_id?: number;
  personal_task_id?: number;
  financial_entry_id?: number;
  officer_id?: number;
}

interface AgentInputProps {
  input: string;
  setInput: (value: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onSubmit: (
    e: React.SyntheticEvent,
    attachments?: AttachedFile[],
    metadata?: {
      webSearchEnabled?: boolean;
      webSearchTrigger?: "explicit_language" | "button" | "user_confirmed";
      webSearchQuery?: string;
      webSearchIntent?: "WEB_SEARCH";
    },
  ) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  isStreaming?: boolean;
  onStopGeneration?: () => void;
  onClear?: () => void;
  context?: ContextIndicator;
  onAttachDocument?: () => void;
  onUploadFile?: () => void;
  onPasteText?: () => void;
  onTakeScreenshot?: () => void;
  isOffline?: boolean;
}

export function AgentInput({
  input,
  setInput,
  inputRef,
  onSubmit,
  onKeyDown,
  isStreaming = false,
  onStopGeneration,
  onClear,
  context,
  isOffline = false,
}: AgentInputProps) {
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [manualDropdownOpen, setManualDropdownOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showDocumentPicker, setShowDocumentPicker] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [searchModeArmed, setSearchModeArmed] = useState<"web" | null>(
    null,
  );
  const [documentSearch, setDocumentSearch] = useState("");
  const [systemDocuments, setSystemDocuments] = useState<SystemDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [fileUploadAccept, setFileUploadAccept] = useState(
    ".pdf,.doc,.docx,.txt,.csv,.md,.json,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.bmp,.webp,.tif,.tiff,.heic,.heif",
  );
  const [isDragging, setIsDragging] = useState(false);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const documentPickerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const attachmentIdRef = useRef(0);

  // Auto-resize textarea
  useEffect(() => {
    const adjustHeight = () => {
      const el = inputRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    };

    adjustHeight();

    window.addEventListener("resize", adjustHeight);
    return () => window.removeEventListener("resize", adjustHeight);
  }, [input, inputRef]);

  const getNextAttachmentId = useCallback(() => {
    attachmentIdRef.current += 1;
    return `attachment-${attachmentIdRef.current}`;
  }, []);

  // Fetch system documents when document picker opens
  useEffect(() => {
    if (showDocumentPicker && systemDocuments.length === 0) {
      setDocumentsLoading(true);
      apiClient
        .get<SystemDocument[]>("/documents")
        .then((docs) => {
          // Sort by created_at descending and limit to recent documents
          const sortedDocs = docs
            .sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime(),
            )
            .slice(0, 100);
          setSystemDocuments(sortedDocs);
        })
        .catch((err) => {
          console.error("Failed to fetch documents:", err);
          setSystemDocuments([]);
        })
        .finally(() => setDocumentsLoading(false));
    }
  }, [showDocumentPicker, systemDocuments.length]);

  const filteredDocuments = systemDocuments.filter(
    (doc) =>
      doc.title.toLowerCase().includes(documentSearch.toLowerCase()) ||
      doc.client_name?.toLowerCase().includes(documentSearch.toLowerCase()) ||
      doc.dossier_reference
        ?.toLowerCase()
        .includes(documentSearch.toLowerCase()),
  );

  useEffect(() => {
    getSlashCommands().then(setCommands);
  }, []);

  useEffect(() => {
    getDocumentFormatGovernance()
      .then((governance) => {
        const accept = String(governance?.supported?.uploadAccept || "").trim();
        if (accept) setFileUploadAccept(accept);
      })
      .catch(() => {});
  }, []);

  const autoFilteredCommands = useMemo(() => {
    if (!input.startsWith("/")) return [];
    return filterCommands(input, commands);
  }, [input, commands]);

  const filteredCommands = useMemo(() => {
    if (input.startsWith("/")) {
      return autoFilteredCommands;
    }
    return manualDropdownOpen ? commands : [];
  }, [input, autoFilteredCommands, commands, manualDropdownOpen]);

  const showDropdown = input.startsWith("/")
    ? autoFilteredCommands.length > 0
    : manualDropdownOpen;

  const selectCommand = useCallback(
    (cmd: SlashCommand) => {
      setInput(cmd.usage.split(" ")[0] + " ");
      setManualDropdownOpen(false);
      inputRef.current?.focus();
    },
    [setInput, inputRef],
  );

  const handleSlashClick = useCallback(() => {
    if (manualDropdownOpen) {
      setManualDropdownOpen(false);
      return;
    }
    // Close attachment menu when opening commands
    setShowAttachMenu(false);
    setManualDropdownOpen(commands.length > 0);
    setSelectedIndex(0);
    inputRef.current?.focus();
  }, [manualDropdownOpen, commands, inputRef]);

  const buildWebSearchMetadata = useCallback(() => {
    if (!searchModeArmed) return undefined;
    const query = input.trim();
    return {
      webSearchEnabled: true,
      webSearchTrigger: "button" as const,
      webSearchQuery: query || undefined,
      webSearchIntent: "WEB_SEARCH" as const,
    };
  }, [input, searchModeArmed]);

  const handleSendMessage = useCallback(
    (e: React.SyntheticEvent) => {
      const currentAttachments = [...attachedFiles];
      const metadata = buildWebSearchMetadata();
      setAttachedFiles([]);
      setSearchModeArmed(null);
      onSubmit(
        e,
        currentAttachments.length > 0 ? currentAttachments : undefined,
        metadata,
      );
    },
    [attachedFiles, buildWebSearchMetadata, onSubmit],
  );

  const handleKeyDownWithCommands = useCallback(
    (e: React.KeyboardEvent) => {
      if (showDropdown && filteredCommands.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((prev) =>
            Math.min(prev + 1, filteredCommands.length - 1),
          );
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
          e.preventDefault();
          selectCommand(filteredCommands[selectedIndex]);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setManualDropdownOpen(false);
          return;
        }
      }
      // Intercept Enter key to include attachments in submit
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage(e);
        return;
      }
      onKeyDown(e);
    },
    [
      showDropdown,
      filteredCommands,
      selectedIndex,
      selectCommand,
      onKeyDown,
      handleSendMessage,
    ],
  );

  const processFiles = useCallback((files: FileList | File[]) => {
    Array.from(files).forEach((file) => {
      // Check if it's an image
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const newFile: AttachedFile = {
            id: getNextAttachmentId(),
            name: file.name,
            type: "image",
            size: file.size,
            preview: event.target?.result as string,
            file,
          };
          setAttachedFiles((prev) => [...prev, newFile]);
        };
        reader.readAsDataURL(file);
      } else {
        const newFile: AttachedFile = {
          id: getNextAttachmentId(),
          name: file.name,
          type: "file",
          size: file.size,
          file,
        };
        setAttachedFiles((prev) => [...prev, newFile]);
      }
    });
  }, [getNextAttachmentId]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files);
    setShowAttachMenu(false);
    if (e.target) e.target.value = "";
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) processFiles(e.target.files);
    setShowAttachMenu(false);
    if (e.target) e.target.value = "";
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  }, [processFiles]);

  const handleDocumentSelect = (doc: SystemDocument) => {
    const newFile: AttachedFile = {
      id: getNextAttachmentId(),
      name: doc.title,
      type: "document",
      documentId: doc.id,
    };
    setAttachedFiles((prev) => [...prev, newFile]);
    setShowDocumentPicker(false);
    setDocumentSearch("");
  };

  const removeAttachment = (id: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case "image":
        return <Image className="w-4 h-4" />;
      case "document":
        return <FileText className="w-4 h-4" />;
      default:
        return <Paperclip className="w-4 h-4" />;
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        attachMenuRef.current &&
        !attachMenuRef.current.contains(event.target as Node)
      ) {
        setShowAttachMenu(false);
      }
      if (
        documentPickerRef.current &&
        !documentPickerRef.current.contains(event.target as Node)
      ) {
        setShowDocumentPicker(false);
      }
    };
    if (showAttachMenu || showDocumentPicker) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showAttachMenu, showDocumentPicker]);

  const getContextIcon = (type: string) => {
    switch (type) {
      case "client":
        return "👤";
      case "dossier":
        return "📁";
      case "lawsuit":
        return "⚖️";
      case "session":
        return "📅";
      case "task":
        return "✓";
      default:
        return "🌐";
    }
  };

  return (
    <div className="w-full bg-[#e2e8f0] dark:bg-[#0f172a]">
      <div className="max-w-[52rem] mx-auto px-4 pb-3 pt-2 sm:px-6">
        {context && (
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 dark:bg-[#0f172a]/60 border border-black/[0.06] dark:border-white/[0.06] rounded-full text-sm font-medium text-slate-700 dark:text-slate-300 shadow-sm">
              <span className="text-lg">{getContextIcon(context.type)}</span>
              <span className="capitalize font-semibold">{context.type}:</span>
              <span className="text-[#0f172a] dark:text-[#f1f5f9]">
                {context.label}
              </span>
            </span>
          </div>
        )}

        <div>
          <div 
            onDragEnter={handleDragOver}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative rounded-2xl border transition-all duration-300 ${
              isDragging 
                ? "border-blue-500 ring-4 ring-blue-500/20 bg-blue-50/50 dark:bg-blue-900/10" 
                : "bg-white dark:bg-[#0f172a] border-slate-200/60 dark:border-slate-800/60 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] focus-within:shadow-[0_8px_30px_-4px_rgba(6,81,237,0.1)] focus-within:border-blue-500/40 focus-within:ring-4 focus-within:ring-blue-500/10"
            }`}
          >
            {showDropdown && (
              <div className="absolute bottom-full left-0 right-0 mb-3 bg-white/95 dark:bg-[#1e293b]/95 backdrop-blur-md border border-black/[0.06] dark:border-white/[0.06] rounded-2xl shadow-xl max-h-80 overflow-y-auto z-50 premium-panel-enter-center">
                <div className="p-2">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 px-3 py-2 uppercase tracking-[0.2em] bg-black/[0.02] dark:bg-white/[0.03] rounded-xl mb-1">
                    Available Commands
                  </div>
                  {filteredCommands.map((cmd, idx) => (
                    <button
                      key={cmd.command}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectCommand(cmd);
                      }}
                      className={`w-full text-left px-4 py-3 rounded-xl transition-all ${
                        idx === selectedIndex
                          ? "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 shadow-sm"
                          : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04] text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <code className="text-sm font-mono font-bold">
                          {cmd.command}
                        </code>
                        <span className="text-[11px] px-2 py-1 bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 rounded-full font-medium capitalize">
                          {cmd.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {cmd.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {showAttachMenu && (
              <div
                ref={attachMenuRef}
                className="absolute bottom-full left-0 mb-3 bg-white/95 dark:bg-[#1e293b]/95 backdrop-blur-md border border-black/[0.06] dark:border-white/[0.06] rounded-2xl shadow-xl z-50 min-w-[280px] overflow-hidden premium-panel-enter-left"
              >
                <div className="p-2">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 px-3 py-2 uppercase tracking-[0.2em] bg-black/[0.02] dark:bg-white/[0.03] rounded-xl mb-1">
                    Attachments
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAttachMenu(false);
                      setShowDocumentPicker(true);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-all group"
                  >
                    <div className="w-10 h-10 flex items-center justify-center bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 rounded-xl group-hover:scale-105 transition-transform">
                      <Folder className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold">Existing Document</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        From your library
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-all group"
                  >
                    <div className="w-10 h-10 flex items-center justify-center bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 rounded-xl group-hover:scale-105 transition-transform">
                      <Upload className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold">Upload File</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        PDF, DOCX, TXT, etc.
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-all group"
                  >
                    <div className="w-10 h-10 flex items-center justify-center bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 rounded-xl group-hover:scale-105 transition-transform">
                      <Image className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold">Upload Image</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        JPG, PNG, GIF, etc.
                      </div>
                    </div>
                  </button>

                  <div className="my-1 mx-3 border-t border-black/[0.04] dark:border-white/[0.04]" />

                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 px-3 py-2 uppercase tracking-[0.2em] bg-black/[0.02] dark:bg-white/[0.03] rounded-xl mb-1">
                    Tools
                  </div>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setShowAttachMenu(false);
                      handleSlashClick();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-all group"
                  >
                    <div className="w-10 h-10 flex items-center justify-center bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 rounded-xl group-hover:scale-105 transition-transform text-lg font-mono font-bold">
                      /
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold">Commands</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        Slash commands
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    disabled={isStreaming}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (isStreaming) return;
                      setSearchModeArmed((prev) =>
                        prev === "web" ? null : "web",
                      );
                      setShowAttachMenu(false);
                      inputRef.current?.focus();
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-all group ${
                      searchModeArmed === "web"
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <div
                      className={`w-10 h-10 flex items-center justify-center rounded-xl group-hover:scale-105 transition-transform ${
                        searchModeArmed === "web"
                          ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                          : "bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      <Globe className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold">Web Search</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {searchModeArmed === "web"
                          ? "Active — click to disable"
                          : "Search the web"}
                      </div>
                    </div>
                    {searchModeArmed === "web" && (
                      <Check className="w-4 h-4 text-blue-500" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {showDocumentPicker && (
              <div
                ref={documentPickerRef}
                className="absolute bottom-full left-0 mb-3 bg-white/95 dark:bg-[#1e293b]/95 backdrop-blur-md border border-black/[0.06] dark:border-white/[0.06] rounded-2xl shadow-xl z-50 w-full max-w-md overflow-hidden premium-panel-enter-left"
              >
                <div className="p-4 border-b border-black/[0.04] dark:border-white/[0.04] bg-black/[0.02] dark:bg-white/[0.03]">
                  <div className="flex items-center gap-2 mb-3">
                    <Folder className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                    <h3 className="font-bold text-[#0f172a] dark:text-[#f1f5f9]">
                      Select Document
                    </h3>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={documentSearch}
                      onChange={(e) => setDocumentSearch(e.target.value)}
                      placeholder="Search documents..."
                      className="w-full pl-10 pr-4 py-2 bg-white dark:bg-[#1e293b] border border-black/[0.06] dark:border-white/[0.06] rounded-xl text-sm focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-400/20"
                    />
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto p-2">
                  {documentsLoading && (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-sm text-slate-500 dark:text-slate-400">
                        Loading documents...
                      </div>
                    </div>
                  )}
                  {!documentsLoading && filteredDocuments.length === 0 && (
                     <div className="flex items-center justify-center py-8">
                      <div className="text-sm text-slate-500 dark:text-slate-400">
                        No documents found
                      </div>
                    </div>
                  )}
                  {!documentsLoading &&
                    filteredDocuments.map((doc) => {
                      const fileSize =
                        doc.size_bytes < 1024
                          ? `${doc.size_bytes} B`
                          : doc.size_bytes < 1024 * 1024
                            ? `${(doc.size_bytes / 1024).toFixed(1)} KB`
                            : `${(doc.size_bytes / (1024 * 1024)).toFixed(1)} MB`;

                      const fileExt =
                        doc.title.split(".").pop()?.toUpperCase() || "FILE";
                      const createdDate = new Date(doc.created_at);
                      const formattedDate = createdDate.toLocaleDateString();

                      // Build metadata string
                      const metadata = [
                        fileExt,
                        fileSize,
                        formattedDate,
                        doc.client_name && `Client: ${doc.client_name}`,
                        doc.dossier_reference &&
                          `Dossier: ${doc.dossier_reference}`,
                      ]
                        .filter(Boolean)
                        .join(" · ");

                      return (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => handleDocumentSelect(doc)}
                          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-all group"
                        >
                          <div className="w-10 h-10 flex items-center justify-center bg-black/[0.04] dark:bg-white/[0.06] rounded-xl group-hover:bg-black/[0.08] dark:group-hover:bg-white/[0.08] transition-colors flex-shrink-0 border border-black/[0.04] dark:border-white/[0.04]">
                            <FileText className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-[#0f172a] dark:text-[#f1f5f9] truncate">
                              {doc.title}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {metadata}
                            </div>
                          </div>
                          <Check className="w-5 h-5 text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileUpload}
              className="hidden"
              accept={fileUploadAccept}
            />
            <input
              ref={imageInputRef}
              type="file"
              multiple
              onChange={handleImageUpload}
              className="hidden"
              accept="image/*"
            />

            {(attachedFiles.length > 0 || searchModeArmed) && (
              <div className="px-4 pt-3 pb-1 flex flex-wrap gap-2 items-center">
                {searchModeArmed && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-500/10 border border-blue-500/20 dark:border-blue-400/20 rounded-full premium-badge-enter">
                    <div className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-500/20">
                      <Globe className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                    </div>
                    <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                      Web Search
                    </span>
                    <button
                      type="button"
                      onClick={() => setSearchModeArmed(null)}
                      className="ml-1 w-4 h-4 flex items-center justify-center rounded-full text-blue-500 hover:bg-blue-500/10 dark:text-blue-400 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {attachedFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-1.5 pl-1.5 pr-2 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/50 rounded-full animate-in fade-in zoom-in duration-200"
                  >
                    {file.type === "image" && file.preview ? (
                      <img
                        src={file.preview}
                        alt={file.name}
                        className="w-5 h-5 object-cover rounded-full border border-black/5 dark:border-white/5"
                      />
                    ) : (
                      <div className="flex items-center justify-center w-5 h-5 rounded-full bg-white dark:bg-slate-700 shadow-sm text-slate-500 dark:text-slate-400">
                        <div className="scale-75">{getFileIcon(file.type)}</div>
                      </div>
                    )}
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[120px] px-0.5">
                      {file.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(file.id)}
                      className="ml-0.5 w-4 h-4 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 px-3 py-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setManualDropdownOpen(false);
                    setShowDocumentPicker(false);
                    setShowAttachMenu(!showAttachMenu);
                    setTimeout(() => inputRef.current?.focus(), 0);
                  }}
                  title="Tools & attachments"
                  aria-label="Tools and attachments"
                  className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${
                    showAttachMenu
                      ? "bg-[#0f172a] text-white dark:bg-[#f1f5f9] dark:text-[#0f172a] rotate-45"
                      : searchModeArmed
                        ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50"
                        : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                  }`}
                >
                  <Plus className="w-4.5 h-4.5" />
                </button>
              </div>

              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  const value = e.target.value;
                  setInput(value);
                  if (value.startsWith("/")) {
                    setManualDropdownOpen(false);
                    setSelectedIndex(0);
                  }
                }}
                onKeyDown={handleKeyDownWithCommands}
                onBlur={() => {
                  setTimeout(() => {
                    if (!input.startsWith("/")) {
                      setManualDropdownOpen(false);
                    }
                  }, 150);
                }}
                rows={1}
                disabled={isOffline}
                placeholder={isOffline ? "Connect to the internet to use the Agent..." : "Ask Ordinay anything about your lawsuits, clients, tasks, or request reports and analysis..."}
                className="flex-1 resize-none bg-transparent px-2 py-0 text-[14px] leading-8 text-[#0f172a] dark:text-[#f1f5f9] placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none overflow-y-auto disabled:cursor-not-allowed"
              />

              <div className="flex items-center gap-1">
                {input.trim() && !isStreaming && (
                  <button
                    type="button"
                    onClick={onClear}
                    title="Clear input"
                    aria-label="Clear input"
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 dark:text-slate-500 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] hover:text-slate-600 dark:hover:text-slate-400 transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                {isStreaming ? (
                  <button
                    type="button"
                    onClick={onStopGeneration}
                    title="Stop generation"
                    aria-label="Stop generation"
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-300 transition-all"
                  >
                    <div className="w-3 h-3 bg-current rounded-sm" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                      event.preventDefault();
                      handleSendMessage(event);
                    }}
                    disabled={isOffline || (!input.trim() && attachedFiles.length === 0)}
                    title="Send message"
                    aria-label="Send message"
                    className="group relative w-8 h-8 flex items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-sm shadow-blue-500/20 hover:shadow-md hover:shadow-blue-500/40 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:-translate-y-0 disabled:hover:shadow-sm transition-all duration-200"
                  >
                    <div className="absolute inset-0 rounded-xl bg-white opacity-0 group-hover:opacity-10 transition-opacity" />
                    <svg
                      className="w-4 h-4 group-active:scale-90 transition-transform"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M12 19V5M5 12l7-7 7 7"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-center gap-x-3 text-[11px] text-slate-400/80 dark:text-slate-500/80">
          <span>
            <kbd className="font-mono text-slate-500 dark:text-slate-400">
              Enter
            </kbd>{" "}
            to send
          </span>
          <span className="hidden sm:inline text-slate-300 dark:text-slate-600">
            ·
          </span>
          <span className="hidden sm:inline">
            <kbd className="font-mono text-slate-500 dark:text-slate-400">
              Shift+Enter
            </kbd>{" "}
            new line
          </span>
          <span className="hidden sm:inline text-slate-300 dark:text-slate-600">
            ·
          </span>
          <span className="hidden sm:inline">
            <kbd className="font-mono text-slate-500 dark:text-slate-400">
              /
            </kbd>{" "}
            commands
          </span>
        </div>
      </div>
    </div>
  );
}
