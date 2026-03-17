import { useState, useEffect } from "react";
import { useToast } from "../../../contexts/ToastContext";
import { useConfirm } from "../../../contexts/ConfirmContext";
import { useSettings } from "../../../contexts/SettingsContext";
import ContentSection from "../../layout/ContentSection";
import documentService from "../../../services/documentService.js";
import { getDocumentFormatGovernance } from "../../../services/api/documentFormats";
import { useTranslation } from "react-i18next";
import { InlineLoader } from "../../brand/OrdinayDataLoader";
import { subscribeEntityMutationSuccess } from "../../../core/mutationSync";

/**
 * Documents Tab - Centralized document management
 * Uses entity-agnostic document service with abstracted storage
 * Desktop-first design with local filesystem support
 */
export default function DocumentsTab({ data, config, onDocumentsChange }) {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { formatDate } = useSettings();
  const { t } = useTranslation("common");

  // Entity information for linking
  const entityType = config.entityType || 'unknown';
  const entityId = data.id;

  // Load documents from centralized service
  const [documents, setDocuments] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [missingFiles, setMissingFiles] = useState(new Set());
  const [uploadAccept, setUploadAccept] = useState(
    ".pdf,.doc,.docx,.txt,.csv,.md,.json,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.bmp,.webp,.tif,.tiff,.heic,.heif",
  );

  // Load documents for this entity
  useEffect(() => {
    loadDocuments();
  }, [entityType, entityId]);

  useEffect(() => {
    const unsubscribe = subscribeEntityMutationSuccess((event) => {
      const parentType = String(event.scope?.parentEntityType || "").toLowerCase();
      const parentId = Number(event.scope?.parentEntityId || 0);
      const sameParent = parentType === String(entityType || "").toLowerCase() && parentId === Number(entityId);
      const sameEntity = event.entityType === String(entityType || "").toLowerCase() && Number(event.entityId) === Number(entityId);
      const isDocumentMutation = event.entityType === "document";
      if (sameParent || sameEntity || isDocumentMutation) {
        loadDocuments();
      }
    });
    return () => unsubscribe();
  }, [entityType, entityId]);

  useEffect(() => {
    getDocumentFormatGovernance()
      .then((governance) => {
        const accept = String(governance?.supported?.uploadAccept || "").trim();
        if (accept) setUploadAccept(accept);
      })
      .catch(() => {});
  }, []);

  const loadDocuments = async () => {
    const entityDocuments = await documentService.getEntityDocuments(entityType, entityId);
    setDocuments(entityDocuments);
    checkMissingFiles(entityDocuments);
  };

  // Check for missing files in storage
  const checkMissingFiles = async (docs) => {
    const missing = new Set();
    for (const doc of docs) {
      const exists = await documentService.documentFileExists(doc.id);
      if (!exists) {
        missing.add(doc.id);
      }
    }
    setMissingFiles(missing);
  };

  const getFileIcon = (type) => {
    const iconMap = {
      'pdf': 'fas fa-file-pdf text-red-600 dark:text-red-400',
      'doc': 'fas fa-file-word text-blue-600 dark:text-blue-400',
      'docx': 'fas fa-file-word text-blue-600 dark:text-blue-400',
      'xls': 'fas fa-file-excel text-green-600 dark:text-green-400',
      'xlsx': 'fas fa-file-excel text-green-600 dark:text-green-400',
      'ppt': 'fas fa-file-powerpoint text-orange-600 dark:text-orange-400',
      'pptx': 'fas fa-file-powerpoint text-orange-600 dark:text-orange-400',
      'jpg': 'fas fa-file-image text-purple-600 dark:text-purple-400',
      'jpeg': 'fas fa-file-image text-purple-600 dark:text-purple-400',
      'png': 'fas fa-file-image text-purple-600 dark:text-purple-400',
      'gif': 'fas fa-file-image text-purple-600 dark:text-purple-400',
      'zip': 'fas fa-file-archive text-amber-600 dark:text-amber-400',
      'rar': 'fas fa-file-archive text-amber-600 dark:text-amber-400',
      'txt': 'fas fa-file-alt text-slate-600 dark:text-slate-400',
    };
    return iconMap[type?.toLowerCase()] || 'fas fa-file text-slate-600 dark:text-slate-400';
  };

  const renderTextStatusBadge = (doc) => {
    if (doc.textStatus === "extracting") {
      return (
        <span className="inline-block px-2 py-0.5 bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-xs rounded">
          {t("detail.documents.status.extracting", { defaultValue: "Extracting text..." })}
        </span>
      );
    }
    if (doc.textStatus === "readable") {
      const sourceLabel = doc.textSource === "tesseract" || doc.textSource === "tesseract-pdf"
        ? t("detail.documents.status.readableOcr", { defaultValue: "Readable (OCR)" })
        : t("detail.documents.status.readable", { defaultValue: "Readable" });
      return (
        <span className="inline-block px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-xs rounded">
          {sourceLabel}
        </span>
      );
    }
    if (doc.textStatus === "needs_ocr") {
      return (
        <span className="inline-block px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 text-xs rounded">
          {t("detail.documents.status.needsOcr", { defaultValue: "Needs OCR" })}
        </span>
      );
    }
    if (doc.textStatus === "failed") {
      const detail = doc.failureDetail || doc.textFailureReason || "";
      const suffix = detail ? ` (${detail})` : "";
      return (
        <span className="inline-block px-2 py-0.5 bg-rose-100 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-xs rounded">
          {t("detail.documents.status.failed", { defaultValue: `Extraction failed${suffix}` })}
        </span>
      );
    }
    if (doc.textStatus === "unreadable") {
      return (
        <span className="inline-block px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs rounded">
          {t("detail.documents.status.unreadable", { defaultValue: "Not processed" })}
        </span>
      );
    }
    return null;
  };

  const handleFileSelect = async (files) => {
    setUploading(true);

    try {
      const fileArray = Array.from(files);

      // Upload via centralized service
      const results = await documentService.uploadMultipleDocuments(
        fileArray,
        entityType,
        entityId
      );

      // Reload documents
      loadDocuments();

      // Notify parent (for backward compatibility with legacy systems)
      if (onDocumentsChange) {
        const updatedDocs = await documentService.getEntityDocuments(entityType, entityId);
        onDocumentsChange(updatedDocs);
      }

      // Show results
      if (results.successful.length > 0) {
        showToast(
          t("detail.documents.toast.success.upload", { count: results.successful.length }),
          "success"
        );
      }

      if (results.failed.length > 0) {
        showToast(
          t("detail.documents.toast.error.uploadFailed", { count: results.failed.length }),
          "error"
        );
        console.error("Failed uploads:", results.failed);
      }

    } catch (error) {
      console.error("Error uploading files:", error);
      showToast(t("detail.documents.toast.error.uploadError"), "error");
    } finally {
      setUploading(false);
    }
  };

  const handleOpen = async (doc) => {
    try {
      await documentService.openDocument(doc.id);
    } catch (error) {
      console.error("Error opening document:", error);
      showToast(
        t("detail.documents.toast.error.open"),
        "error"
      );
    }
  };

  const handleDownload = async (doc) => {
    try {
      await documentService.downloadDocument(doc.id);
      showToast(t("detail.documents.toast.success.downloadStart", { name: doc.name }), "success");
    } catch (error) {
      console.error("Error downloading document:", error);
      showToast(t("detail.documents.toast.error.download"), "error");
    }
  };

  const handleReveal = async (doc) => {
    try {
      await documentService.revealDocument(doc.id);
    } catch (error) {
      console.error("Error revealing document:", error);
      showToast(t("detail.documents.toast.error.reveal"), "error");
    }
  };

  const handleDelete = async (docId) => {
    const confirmed = await confirm({
      title: t("dialog.detail.documents.delete.title"),
      message: t("dialog.detail.documents.delete.message"),
      confirmText: t("dialog.detail.documents.delete.confirm"),
      cancelText: t("dialog.detail.documents.delete.cancel"),
      variant: "danger"
    });

    if (confirmed !== null) {
      const deleteFile = confirmed === true;
      const success = await documentService.deleteDocument(
        docId,
        entityType,
        entityId,
        deleteFile
      );

      if (success) {
        loadDocuments();
        if (onDocumentsChange) {
          const updatedDocs = await documentService.getEntityDocuments(entityType, entityId);
          onDocumentsChange(updatedDocs);
        }
        showToast(
          deleteFile ? t("detail.documents.toast.success.delete") : t("detail.documents.toast.success.unlink"),
          "success"
        );
      } else {
        showToast(t("detail.documents.toast.error.delete"), "error");
      }
    }
  };

  const handleRelink = async (docId) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = uploadAccept;

    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (file) {
        const success = await documentService.relinkDocument(docId, file);
        if (success) {
          loadDocuments();
          onDocumentsChange && onDocumentsChange(await documentService.getEntityDocuments(entityType, entityId));
          showToast(t("detail.documents.toast.success.relink"), "success");
        } else {
          showToast(t("detail.documents.toast.error.replace"), "error");
        }
      }
    };

    input.click();
  };

  const handleRetryExtraction = async (docId) => {
    try {
      await documentService.retryExtraction(docId);
      loadDocuments();
      showToast(t("detail.documents.toast.success.retryExtraction", { defaultValue: "Extraction restarted" }), "success");
    } catch (error) {
      console.error("Error retrying extraction:", error);
      showToast(t("detail.documents.toast.error.retryExtraction", { defaultValue: "Retry failed" }), "error");
    }
  };

  const handleRunOcr = async (docId) => {
    try {
      await documentService.runOcr(docId);
      loadDocuments();
      showToast(t("detail.documents.toast.success.runOcr", { defaultValue: "OCR completed" }), "success");
    } catch (error) {
      console.error("Error running OCR:", error);
      showToast(t("detail.documents.toast.error.runOcr", { defaultValue: "OCR failed" }), "error");
    }
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files);
    }
  };

  const handleFileInputChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files);
    }
    // Reset input
    e.target.value = '';
  };

  if (documents.length === 0) {
    return (
      <ContentSection data-tutorial="dossier-documents-section" title={t("detail.documents.title", { count: 0 })}>
        <div className="p-12">
          {/* Drag & Drop Zone */}
          <div
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-all ${isDragging
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500'
              }`}
          >
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
              <i className="fas fa-cloud-upload-alt text-slate-400 dark:text-slate-600 text-2xl"></i>
            </div>
            <p className="text-slate-900 dark:text-white font-medium mb-2">
              {t("detail.documents.upload.dragDrop")}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {t("detail.documents.upload.or")}
            </p>
            <label className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium cursor-pointer transition-colors">
              <i className="fas fa-plus mr-2"></i>
              {t("detail.documents.upload.browse")}
              <input
                type="file"
                multiple
                onChange={handleFileInputChange}
                className="hidden"
                accept={uploadAccept}
              />
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
              {t("detail.documents.upload.formats")}
            </p>
          </div>
        </div>
      </ContentSection>
    );
  }

  return (
    <ContentSection data-tutorial="dossier-documents-section" title={t("detail.documents.title", { count: documents.length })}>
      <div className="p-6">
        {/* Upload Zone */}
        <div
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`mb-6 border-2 border-dashed rounded-lg p-6 text-center transition-all ${isDragging
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500'
            }`}
        >
          <div className="flex items-center justify-center gap-4">
            <i className="fas fa-cloud-upload-alt text-slate-400 text-2xl"></i>
            <div className="text-left">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                {t("detail.documents.upload.dragDropOr")}
              </p>
              <label className="text-sm text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">
                {t("detail.documents.upload.browseLink")}
                <input
                  type="file"
                  multiple
                  onChange={handleFileInputChange}
                  className="hidden"
                  accept={uploadAccept}
                />
              </label>
            </div>
          </div>
        </div>

        {/* Loading Indicator */}
        {uploading && (
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <InlineLoader message={t("detail.documents.status.uploading")} size="sm" />
          </div>
        )}

        {/* Documents Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {documents.map((doc) => {
            const isMissing = missingFiles.has(doc.id);
            const statusBadge = renderTextStatusBadge(doc);
            return (
              <div
                key={doc.id}
                className={`p-4 border rounded-lg transition-colors group ${isMissing
                  ? 'border-yellow-400 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/10'
                  : 'border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500'
                  }`}
              >
                {/* Missing File Warning */}
                {isMissing && (
                  <div className="mb-3 p-2 bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded text-xs text-yellow-800 dark:text-yellow-300 flex items-center gap-2">
                    <i className="fas fa-exclamation-triangle"></i>
                    <span>{t("detail.documents.status.missingFile")}</span>
                    <button
                      onClick={() => handleRelink(doc.id)}
                      className="ml-auto text-yellow-700 dark:text-yellow-400 underline hover:no-underline"
                    >
                      {t("detail.documents.actions.relink")}
                    </button>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  {/* File Icon */}
                  <div
                    className={`p-3 rounded-lg flex-shrink-0 cursor-pointer ${isMissing
                      ? 'bg-yellow-100 dark:bg-yellow-900/20'
                      : 'bg-slate-100 dark:bg-slate-700'
                      }`}
                    onClick={() => !isMissing && handleOpen(doc)}
                    title={isMissing ? t("detail.documents.status.missingFile") : t("detail.documents.actions.open")}
                  >
                    <i className={`${getFileIcon(doc.type)} text-xl ${isMissing ? 'opacity-50' : ''}`}></i>
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`font-medium truncate cursor-pointer ${isMissing
                        ? 'text-slate-600 dark:text-slate-400'
                        : 'text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400'
                        }`}
                      onClick={() => !isMissing && handleOpen(doc)}
                      title={doc.name}
                    >
                      {doc.name}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {doc.size}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {formatDate(doc.uploadDate)}
                      </span>
                    </div>
                    {(doc.category || statusBadge) && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {doc.category && (
                          <span className="inline-block px-2 py-0.5 bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-xs rounded">
                            {doc.category}
                          </span>
                        )}
                        {statusBadge}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {doc.textStatus === "failed" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRetryExtraction(doc.id);
                        }}
                        className="p-2 hover:bg-indigo-100 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                        title={t("detail.documents.actions.retryExtraction", { defaultValue: "Retry extraction" })}
                      >
                        <i className="fas fa-redo text-indigo-600 dark:text-indigo-400"></i>
                      </button>
                    )}
                    {doc.textStatus === "needs_ocr" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRunOcr(doc.id);
                        }}
                        className="p-2 hover:bg-violet-100 dark:hover:bg-violet-900/20 rounded-lg transition-colors"
                        title={t("detail.documents.actions.runOcr", { defaultValue: "Run OCR" })}
                      >
                        <i className="fas fa-eye text-violet-600 dark:text-violet-400"></i>
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(doc);
                      }}
                      className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                      title={t("detail.documents.actions.download")}
                      disabled={isMissing}
                    >
                      <i className={`fas fa-download text-slate-600 dark:text-slate-400 ${isMissing ? 'opacity-30' : ''}`}></i>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReveal(doc);
                      }}
                      className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      title={t("detail.documents.actions.reveal")}
                      disabled={isMissing}
                    >
                      <i className={`fas fa-folder-open text-slate-600 dark:text-slate-400 ${isMissing ? 'opacity-30' : ''}`}></i>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(doc.id);
                      }}
                      className="p-2 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      title={t("detail.documents.actions.delete")}
                    >
                      <i className="fas fa-trash text-red-600 dark:text-red-400"></i>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Document Stats */}
        <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {documents.length}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("detail.documents.stats.total")}
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {documents.filter(d => d.type === 'pdf').length}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("detail.documents.stats.pdf")}
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {documents.filter(d => ['jpg', 'jpeg', 'png', 'gif'].includes(d.type)).length}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("detail.documents.stats.images")}
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {(documents.reduce((sum, d) => sum + (d.sizeBytes || 0), 0) / (1024 * 1024)).toFixed(1)} MB
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("detail.documents.stats.totalSize")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </ContentSection>
  );
}
