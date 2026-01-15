import { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  Paperclip,
  Image,
  FileText,
  Upload,
  Folder,
  Search,
  Check,
} from "lucide-react";
import {
  getSlashCommands,
  filterCommands,
  SlashCommand,
} from "../../services/api/agent";

export interface ContextIndicator {
  type: "client" | "dossier" | "case" | "session" | "task" | "global";
  label: string;
  id?: number;
}

interface AttachedFile {
  id: string;
  name: string;
  type: "file" | "document" | "image";
  size?: number;
  preview?: string;
  documentId?: number;
}

interface AgentInputProps {
  input: string;
  setInput: (value: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onSubmit: (e: React.FormEvent) => void;
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
  const [filteredCommands, setFilteredCommands] = useState<SlashCommand[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showDocumentPicker, setShowDocumentPicker] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [documentSearch, setDocumentSearch] = useState("");
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const documentPickerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const mockDocuments = [
    {
      id: 1,
      name: "Contract_2024.pdf",
      type: "PDF",
      size: "2.4 MB",
      date: "2024-01-10",
    },
    {
      id: 2,
      name: "Client_Agreement.docx",
      type: "DOCX",
      size: "1.8 MB",
      date: "2024-01-09",
    },
    {
      id: 3,
      name: "Financial_Report.xlsx",
      type: "XLSX",
      size: "3.2 MB",
      date: "2024-01-08",
    },
    {
      id: 4,
      name: "Legal_Brief.pdf",
      type: "PDF",
      size: "1.5 MB",
      date: "2024-01-07",
    },
    {
      id: 5,
      name: "Meeting_Notes.txt",
      type: "TXT",
      size: "45 KB",
      date: "2024-01-06",
    },
  ];

  const filteredDocuments = mockDocuments.filter((doc) =>
    doc.name.toLowerCase().includes(documentSearch.toLowerCase())
  );

  useEffect(() => {
    getSlashCommands().then(setCommands);
  }, []);

  useEffect(() => {
    if (input.startsWith("/")) {
      const filtered = filterCommands(input, commands);
      setFilteredCommands(filtered);
      setShowDropdown(filtered.length > 0);
      setSelectedIndex(0);
    } else if (!showDropdown) {
      setFilteredCommands([]);
    }
  }, [input, commands, showDropdown]);

  const selectCommand = useCallback(
    (cmd: SlashCommand) => {
      setInput(cmd.usage.split(" ")[0] + " ");
      setShowDropdown(false);
      inputRef.current?.focus();
    },
    [setInput, inputRef]
  );

  const handleSlashClick = useCallback(() => {
    if (showDropdown) {
      setShowDropdown(false);
    } else {
      setFilteredCommands(commands);
      setShowDropdown(commands.length > 0);
      setSelectedIndex(0);
      inputRef.current?.focus();
    }
  }, [showDropdown, commands, inputRef]);

  const handleKeyDownWithCommands = useCallback(
    (e: React.KeyboardEvent) => {
      if (showDropdown && filteredCommands.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((prev) =>
            Math.min(prev + 1, filteredCommands.length - 1)
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
          setShowDropdown(false);
          return;
        }
      }
      onKeyDown(e);
    },
    [showDropdown, filteredCommands, selectedIndex, selectCommand, onKeyDown]
  );

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const newFile: AttachedFile = {
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        type: "file",
        size: file.size,
      };
      setAttachedFiles((prev) => [...prev, newFile]);
    });
    setShowAttachMenu(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const newFile: AttachedFile = {
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          type: "image",
          size: file.size,
          preview: event.target?.result as string,
        };
        setAttachedFiles((prev) => [...prev, newFile]);
      };
      reader.readAsDataURL(file);
    });
    setShowAttachMenu(false);
  };

  const handleDocumentSelect = (doc: any) => {
    const newFile: AttachedFile = {
      id: Math.random().toString(36).substr(2, 9),
      name: doc.name,
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
      case "case":
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
    <div className="flex-shrink-0 border-t border-slate-200 dark:border-slate-800 bg-gradient-to-b from-white to-slate-50 dark:from-slate-900 dark:to-slate-950">
      <div className="max-w-5xl mx-auto px-6 py-4">
        {context && (
          <div className="mb-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 shadow-sm">
              <span className="text-lg">{getContextIcon(context.type)}</span>
              <span className="capitalize font-semibold">{context.type}:</span>
              <span className="text-slate-900 dark:text-slate-100">
                {context.label}
              </span>
            </span>
          </div>
        )}

        <div>
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl border-2 border-slate-200 dark:border-slate-700 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all">
            {showDropdown && (
              <div className="absolute bottom-full left-0 right-0 mb-3 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl max-h-80 overflow-y-auto z-50">
                <div className="p-2">
                  <div className="text-xs font-bold text-slate-500 dark:text-slate-400 px-3 py-2 uppercase tracking-wider bg-slate-50 dark:bg-slate-900 rounded-lg mb-1">
                    Available Commands
                  </div>
                  {filteredCommands.map((cmd, idx) => (
                    <button
                      key={cmd.command}
                      type="button"
                      onClick={() => selectCommand(cmd)}
                      className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                        idx === selectedIndex
                          ? "bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/30 dark:to-purple-900/30 text-blue-700 dark:text-blue-300 shadow-sm"
                          : "hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <code className="text-sm font-mono font-bold">
                          {cmd.command}
                        </code>
                        <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-full font-medium capitalize">
                          {cmd.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
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
                className="absolute bottom-full left-0 mb-3 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 min-w-[280px] overflow-hidden"
              >
                <div className="p-2">
                  <div className="text-xs font-bold text-slate-500 dark:text-slate-400 px-3 py-2 uppercase tracking-wider bg-slate-50 dark:bg-slate-900 rounded-lg mb-1">
                    Add Attachment
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDocumentPicker(true)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 dark:hover:from-blue-900/20 dark:hover:to-purple-900/20 transition-all group"
                  >
                    <div className="w-10 h-10 flex items-center justify-center bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg group-hover:scale-110 transition-transform">
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
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-gradient-to-r hover:from-green-50 hover:to-emerald-50 dark:hover:from-green-900/20 dark:hover:to-emerald-900/20 transition-all group"
                  >
                    <div className="w-10 h-10 flex items-center justify-center bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg group-hover:scale-110 transition-transform">
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
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-gradient-to-r hover:from-purple-50 hover:to-pink-50 dark:hover:from-purple-900/20 dark:hover:to-pink-900/20 transition-all group"
                  >
                    <div className="w-10 h-10 flex items-center justify-center bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg group-hover:scale-110 transition-transform">
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
                className="absolute bottom-full left-0 mb-3 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 w-full max-w-md overflow-hidden"
              >
                <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                  <div className="flex items-center gap-2 mb-3">
                    <Folder className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <h3 className="font-bold text-slate-900 dark:text-white">
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
                      className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto p-2">
                  {filteredDocuments.map((doc) => (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => handleDocumentSelect(doc)}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left hover:bg-gradient-to-r hover:from-blue-50 hover:to-purple-50 dark:hover:from-blue-900/20 dark:hover:to-purple-900/20 transition-all group"
                    >
                      <div className="w-10 h-10 flex items-center justify-center bg-slate-100 dark:bg-slate-700 rounded-lg group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30 transition-colors">
                        <FileText className="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-slate-900 dark:text-white truncate">
                          {doc.name}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {doc.type} · {doc.size} · {doc.date}
                        </div>
                      </div>
                      <Check className="w-5 h-5 text-green-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
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
              <div className="px-4 pt-4 pb-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                <div className="flex flex-wrap gap-2">
                  {attachedFiles.map((file) => (
                    <div key={file.id} className="relative group">
                      {file.type === "image" && file.preview ? (
                        <div className="relative">
                          <img
                            src={file.preview}
                            alt={file.name}
                            className="w-20 h-20 object-cover rounded-lg border-2 border-slate-200 dark:border-slate-700"
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
                        <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg hover:border-blue-500 transition-colors">
                          <div className="text-blue-600 dark:text-blue-400">
                            {getFileIcon(file.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-slate-900 dark:text-white truncate max-w-[150px]">
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

            <div className="flex items-start gap-2 p-3">
              <div className="flex items-center gap-1 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAttachMenu(!showAttachMenu)}
                  title="Add attachment"
                  className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all ${
                    showAttachMenu
                      ? "bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg scale-110"
                      : "bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 text-slate-600 dark:text-slate-300 hover:scale-110 hover:shadow-md"
                  }`}
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleSlashClick}
                  title="Show commands"
                  className={`w-9 h-9 flex items-center justify-center rounded-xl text-lg font-mono font-bold transition-all ${
                    showDropdown
                      ? "bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg scale-110"
                      : "bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 text-slate-600 dark:text-slate-300 hover:scale-110 hover:shadow-md"
                  }`}
                >
                  /
                </button>
              </div>

              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDownWithCommands}
                onBlur={() => {
                  setTimeout(() => {
                    if (!input.startsWith("/")) {
                      setShowDropdown(false);
                    }
                  }, 150);
                }}
                rows={3}
                placeholder="Ask Organia anything about your cases, clients, tasks, or request reports and analysis..."
                className="flex-1 resize-none bg-transparent px-2 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
              />

              <div className="flex items-center gap-1 pt-2">
                {input.trim() && !isStreaming && (
                  <button
                    type="button"
                    onClick={onClear}
                    title="Clear input"
                    className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600 dark:hover:text-slate-400 transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                {isStreaming ? (
                  <button
                    type="button"
                    onClick={onStopGeneration}
                    title="Stop generation"
                    className="px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-sm font-bold rounded-xl transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
                  >
                    <div className="w-3 h-3 bg-white rounded-sm" />
                    Stop
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e: any) => onSubmit(e)}
                    disabled={!input.trim()}
                    className="px-5 py-2 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-700 text-white text-sm font-bold rounded-xl hover:from-blue-700 hover:via-purple-700 hover:to-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl hover:scale-105 flex items-center gap-2"
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

        <div className="mt-3 flex items-center justify-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-md text-slate-600 dark:text-slate-400 font-mono font-semibold shadow-sm">
              Enter
            </kbd>
            to send
          </span>
          <span className="text-slate-300 dark:text-slate-600">•</span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-md text-slate-600 dark:text-slate-400 font-mono font-semibold shadow-sm">
              Shift+Enter
            </kbd>
            for new line
          </span>
          <span className="text-slate-300 dark:text-slate-600">•</span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-md text-slate-600 dark:text-slate-400 font-mono font-semibold shadow-sm">
              /
            </kbd>
            for commands
          </span>
        </div>
      </div>
    </div>
  );
}
