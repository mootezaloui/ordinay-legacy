import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  X,
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
      webSearchIntent?: "WEB_SEARCH" | "DEEP_SEARCH";
      webDeepSearchEnabled?: boolean;
      webDeepSearchTrigger?: "explicit_language" | "button" | "user_confirmed";
      webDeepSearchQuery?: string;
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
}: AgentInputProps) {
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [manualDropdownOpen, setManualDropdownOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showDocumentPicker, setShowDocumentPicker] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [searchModeArmed, setSearchModeArmed] = useState<"web" | "deep" | null>(null);
  const [documentSearch, setDocumentSearch] = useState("");
  const [systemDocuments, setSystemDocuments] = useState<SystemDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const documentPickerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const attachmentIdRef = useRef(0);

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
    if (searchModeArmed === "deep") {
      return {
        webSearchEnabled: true,
        webSearchTrigger: "button" as const,
        webSearchQuery: query || undefined,
        webSearchIntent: "DEEP_SEARCH" as const,
        webDeepSearchEnabled: true,
        webDeepSearchTrigger: "button" as const,
        webDeepSearchQuery: query || undefined,
      };
    }
    return {
      webSearchEnabled: true,
      webSearchTrigger: "button" as const,
      webSearchQuery: query || undefined,
      webSearchIntent: "WEB_SEARCH" as const,
    };
  }, [input, searchModeArmed]);

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
        const currentAttachments = [...attachedFiles];
        const metadata = buildWebSearchMetadata();
        setAttachedFiles([]);
        setSearchModeArmed(null);
        onSubmit(
          e,
          currentAttachments.length > 0 ? currentAttachments : undefined,
          metadata,
        );
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
      attachedFiles,
      buildWebSearchMetadata,
      onSubmit,
    ],
  );

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const newFile: AttachedFile = {
        id: getNextAttachmentId(),
        name: file.name,
        type: "file",
        size: file.size,
        file,
      };
      setAttachedFiles((prev) => [...prev, newFile]);
    });
    setShowAttachMenu(false);
    // Reset input so same file can be re-selected
    if (e.target) e.target.value = "";
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
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
    });
    setShowAttachMenu(false);
    // Reset input so same file can be re-selected
    if (e.target) e.target.value = "";
  };

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
    <div className="w-full border-t border-black/[0.04] dark:border-white/[0.04] bg-[#f1f5f9] dark:bg-[#0f172a] backdrop-blur">
      <div className="max-w-[52rem] mx-auto px-4 py-3 sm:px-8 sm:py-4">
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
          <div className="relative bg-white dark:bg-[#020617] rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.06)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.15)] border border-black/[0.06] dark:border-white/[0.06] focus-within:border-[#60a5fa]/40 focus-within:ring-2 focus-within:ring-[#60a5fa]/10 transition-all">
            {showDropdown && (
              <div className="absolute bottom-full left-0 right-0 mb-3 bg-white/95 dark:bg-[#1e293b]/95 border border-black/[0.06] dark:border-white/[0.06] rounded-2xl shadow-xl max-h-80 overflow-y-auto z-50">
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
                          ? "bg-black/[0.04] dark:bg-white/10 text-[#0f172a] dark:text-[#f1f5f9] shadow-sm"
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
                className="absolute bottom-full left-0 mb-3 bg-white/95 dark:bg-[#1e293b]/95 border border-black/[0.06] dark:border-white/[0.06] rounded-2xl shadow-xl z-50 min-w-[280px] overflow-hidden"
              >
                <div className="p-2">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 px-3 py-2 uppercase tracking-[0.2em] bg-black/[0.02] dark:bg-white/[0.03] rounded-xl mb-1">
                    Add Attachment
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDocumentPicker(true)}
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
                </div>
              </div>
            )}

            {showDocumentPicker && (
              <div
                ref={documentPickerRef}
                className="absolute bottom-full left-0 mb-3 bg-white/95 dark:bg-[#1e293b]/95 border border-black/[0.06] dark:border-white/[0.06] rounded-2xl shadow-xl z-50 w-full max-w-md overflow-hidden"
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
              accept=".pdf,.doc,.docx,.txt,.xls,.xlsx"
            />
            <input
              ref={imageInputRef}
              type="file"
              multiple
              onChange={handleImageUpload}
              className="hidden"
              accept="image/*"
            />

            {attachedFiles.length > 0 && (
              <div className="px-4 pt-4 pb-2 border-b border-black/[0.04] dark:border-white/[0.04] bg-black/[0.02] dark:bg-white/[0.02]">
                <div className="flex flex-wrap gap-2">
                  {attachedFiles.map((file) => (
                    <div key={file.id} className="relative group">
                      {file.type === "image" && file.preview ? (
                        <div className="relative">
                          <img
                            src={file.preview}
                            alt={file.name}
                            className="w-20 h-20 object-cover rounded-xl border border-black/[0.06] dark:border-white/[0.06]"
                          />
                          <button
                            type="button"
                            onClick={() => removeAttachment(file.id)}
                            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 px-3 py-2 bg-white/90 dark:bg-[#1e293b]/70 border border-black/[0.06] dark:border-white/[0.06] rounded-xl hover:border-black/[0.08] transition-colors">
                          <div className="text-slate-500 dark:text-slate-400">
                            {getFileIcon(file.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-[#0f172a] dark:text-[#f1f5f9] truncate max-w-[150px]">
                              {file.name}
                            </div>
                            {file.size && (
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                {formatFileSize(file.size)}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeAttachment(file.id)}
                            className="w-5 h-5 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {searchModeArmed && (
              <div className="px-4 pt-3 pb-2 border-b border-black/[0.04] dark:border-white/[0.04] bg-cyan-50/70 dark:bg-cyan-900/20">
                <div className="text-xs font-medium text-cyan-800 dark:text-cyan-200">
                  {searchModeArmed === "deep"
                    ? "Deep Search is activated. The next sent message will include a deep search request."
                    : "Web Search is activated. The next sent message will include a web search request."}
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 p-3">
              <div className="flex items-center gap-1 pt-2">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // Close command menu when opening attachment menu
                    if (!showAttachMenu) {
                      setManualDropdownOpen(false);
                    }
                    setShowAttachMenu(!showAttachMenu);
                    // Refocus textarea to prevent blur from closing the menu
                    setTimeout(() => inputRef.current?.focus(), 0);
                  }}
                  title="Add attachment"
                  className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all ${
                    showAttachMenu
                      ? "bg-[#0f172a] text-white dark:bg-[#f1f5f9] dark:text-[#0f172a] shadow-sm"
                      : "bg-black/[0.04] dark:bg-white/[0.05] text-slate-500 dark:text-slate-400 hover:bg-black/[0.07] dark:hover:bg-white/[0.08]"
                  }`}
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSlashClick();
                  }}
                  title="Show commands"
                  className={`w-9 h-9 flex items-center justify-center rounded-xl text-lg font-mono font-bold transition-all ${
                    showDropdown
                      ? "bg-[#0f172a] text-white dark:bg-[#f1f5f9] dark:text-[#0f172a] shadow-sm"
                      : "bg-black/[0.04] dark:bg-white/[0.05] text-slate-500 dark:text-slate-400 hover:bg-black/[0.07] dark:hover:bg-white/[0.08]"
                  }`}
                >
                  /
                </button>

                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (isStreaming) return;
                    setSearchModeArmed((prev) => (prev === "web" ? null : "web"));
                  }}
                  title={
                    searchModeArmed === "web"
                      ? "Disable Web Search for next message"
                      : "Enable Web Search for next message"
                  }
                  disabled={isStreaming}
                  className={`w-9 h-9 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-all ${
                    searchModeArmed === "web"
                      ? "bg-[#3b82f6] text-white dark:bg-[#60a5fa] dark:text-[#020617] shadow-sm"
                      : "bg-black/[0.04] dark:bg-white/[0.05] text-slate-500 dark:text-slate-400 hover:bg-black/[0.07] dark:hover:bg-white/[0.08]"
                  }`}
                >
                  <Globe className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (isStreaming) return;
                    setSearchModeArmed((prev) => (prev === "deep" ? null : "deep"));
                  }}
                  title={
                    searchModeArmed === "deep"
                      ? "Disable Deep Search for next message"
                      : "Enable Deep Search for next message"
                  }
                  disabled={isStreaming}
                  className={`w-9 h-9 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition-all ${
                    searchModeArmed === "deep"
                      ? "bg-[#2563eb] text-white dark:bg-[#60a5fa] dark:text-[#020617] shadow-sm"
                      : "bg-black/[0.04] dark:bg-white/[0.05] text-slate-500 dark:text-slate-400 hover:bg-black/[0.07] dark:hover:bg-white/[0.08]"
                  }`}
                >
                  <Search className="w-4 h-4" />
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
                rows={3}
                placeholder="Ask Ordinay anything about your lawsuits, clients, tasks, or request reports and analysis..."
                className="flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-relaxed text-[#0f172a] dark:text-[#f1f5f9] placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
              />

              <div className="flex items-center gap-1 pt-2">
                {input.trim() && !isStreaming && (
                  <button
                    type="button"
                    onClick={onClear}
                    title="Clear input"
                    className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 dark:text-slate-500 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] hover:text-slate-600 dark:hover:text-slate-400 transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                {isStreaming ? (
                  <button
                    type="button"
                    onClick={onStopGeneration}
                    title="Stop generation"
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-xl transition-all shadow-sm flex items-center gap-2"
                  >
                    <div className="w-3 h-3 bg-white rounded-sm" />
                    Stop
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                      event.preventDefault();
                      const currentAttachments = [...attachedFiles];
                      const metadata = buildWebSearchMetadata();
                      // Clear attachments immediately to prevent them sticking
                      setAttachedFiles([]);
                      setSearchModeArmed(null);
                      onSubmit(
                        event,
                        currentAttachments.length > 0
                          ? currentAttachments
                          : undefined,
                        metadata,
                      );
                    }}
                    disabled={!input.trim() && attachedFiles.length === 0}
                    className="px-5 py-2 bg-[#0f172a] text-white dark:bg-[#f1f5f9] dark:text-[#0f172a] text-sm font-semibold rounded-xl hover:bg-[#1e293b] dark:hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm flex items-center gap-2"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                      />
                    </svg>
                    Send
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-slate-400 dark:text-slate-500">
          <span className="flex items-center gap-1.5">
            <kbd className="px-2 py-1 bg-white/80 dark:bg-white/[0.06] rounded-full text-slate-500 dark:text-slate-400 font-mono font-semibold shadow-sm border border-black/[0.06] dark:border-white/[0.06]">
              Enter
            </kbd>
            to send
          </span>
          <span className="hidden sm:inline text-slate-300 dark:text-slate-600">
            •
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-2 py-1 bg-white/80 dark:bg-white/[0.06] rounded-full text-slate-500 dark:text-slate-400 font-mono font-semibold shadow-sm border border-black/[0.06] dark:border-white/[0.06]">
              Shift+Enter
            </kbd>
            for new line
          </span>
          <span className="hidden sm:inline text-slate-300 dark:text-slate-600">
            •
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-2 py-1 bg-white/80 dark:bg-white/[0.06] rounded-full text-slate-500 dark:text-slate-400 font-mono font-semibold shadow-sm border border-black/[0.06] dark:border-white/[0.06]">
              /
            </kbd>
            for commands
          </span>
        </div>
      </div>
    </div>
  );
}
