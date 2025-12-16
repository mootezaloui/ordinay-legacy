import { useState } from "react";
import { useToast } from "../../../contexts/ToastContext";
import { useConfirm } from "../../../contexts/ConfirmContext";
import ContentSection from "../../layout/ContentSection";

/**
 * Documents Tab - Displays and manages documents with upload functionality
 * Works for any entity with a documents array
 */
export default function DocumentsTab({ data, config, onDocumentsChange }) {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [documents, setDocuments] = useState(data.documents || []);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

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

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 KB';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleFileSelect = async (files) => {
    setUploading(true);

    try {
      // Convert FileList to Array
      const fileArray = Array.from(files);

      // Process each file
      const newDocuments = await Promise.all(
        fileArray.map(async (file) => {
          // Get file extension
          const extension = file.name.split('.').pop();

          // Create document object
          return {
            id: Date.now() + Math.random(), // Unique ID
            name: file.name,
            type: extension,
            size: formatFileSize(file.size),
            sizeBytes: file.size,
            date: new Date().toISOString().split('T')[0],
            category: getCategoryFromType(extension),
            file: file, // Store file object for actual upload
            uploadProgress: 100, // Simulated
          };
        })
      );

      // Add to documents
      const updatedDocuments = [...documents, ...newDocuments];
      setDocuments(updatedDocuments);

      // Notify parent component
      if (onDocumentsChange) {
        onDocumentsChange(updatedDocuments);
      }

      // TODO: Upload to server
      console.log("Files to upload:", newDocuments);
      
      // Simulate upload delay
      await new Promise(resolve => setTimeout(resolve, 500));

      showToast(`${newDocuments.length} document(s) ajouté(s) avec succès!`, "success");

    } catch (error) {
      console.error("Error uploading files:", error);
      showToast("Erreur lors de l'ajout des documents", "error");
    } finally {
      setUploading(false);
    }
  };

  const getCategoryFromType = (extension) => {
    const categoryMap = {
      'pdf': 'PDF',
      'doc': 'Document',
      'docx': 'Document',
      'xls': 'Tableur',
      'xlsx': 'Tableur',
      'ppt': 'Présentation',
      'pptx': 'Présentation',
      'jpg': 'Image',
      'jpeg': 'Image',
      'png': 'Image',
      'gif': 'Image',
      'zip': 'Archive',
      'rar': 'Archive',
      'txt': 'Texte',
    };
    return categoryMap[extension?.toLowerCase()] || 'Autre';
  };

  const handleDownload = (doc) => {
    console.log("Downloading document:", doc);
    // TODO: Implement actual download
    showToast(`Téléchargement de ${doc.name}`, "info");
  };

  const handleDelete = async (docId) => {
    if (await confirm({
      title: "Supprimer le document",
      message: "Êtes-vous sûr de vouloir supprimer ce document ?",
      confirmText: "Supprimer",
      cancelText: "Annuler",
      variant: "danger"
    })) {
      const updatedDocuments = documents.filter(d => d.id !== docId);
      setDocuments(updatedDocuments);

      if (onDocumentsChange) {
        onDocumentsChange(updatedDocuments);
      }

      // TODO: Delete from server
      console.log("Deleting document:", docId);
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
      <ContentSection title="Documents (0)">
        <div className="p-12">
          {/* Drag & Drop Zone */}
          <div
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-all ${
              isDragging
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500'
            }`}
          >
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
              <i className="fas fa-cloud-upload-alt text-slate-400 dark:text-slate-600 text-2xl"></i>
            </div>
            <p className="text-slate-900 dark:text-white font-medium mb-2">
              Glissez-déposez vos fichiers ici
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              ou
            </p>
            <label className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium cursor-pointer transition-colors">
              <i className="fas fa-plus mr-2"></i>
              Parcourir les fichiers
              <input
                type="file"
                multiple
                onChange={handleFileInputChange}
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.zip,.rar,.txt"
              />
            </label>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
              PDF, DOC, XLS, PPT, Images, Archives (Max 10MB par fichier)
            </p>
          </div>
        </div>
      </ContentSection>
    );
  }

  return (
    <ContentSection title={`Documents (${documents.length})`}>
      <div className="p-6">
        {/* Upload Zone */}
        <div
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`mb-6 border-2 border-dashed rounded-lg p-6 text-center transition-all ${
            isDragging
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500'
          }`}
        >
          <div className="flex items-center justify-center gap-4">
            <i className="fas fa-cloud-upload-alt text-slate-400 text-2xl"></i>
            <div className="text-left">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Glissez-déposez vos fichiers ici ou
              </p>
              <label className="text-sm text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">
                parcourir
                <input
                  type="file"
                  multiple
                  onChange={handleFileInputChange}
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.zip,.rar,.txt"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Loading Indicator */}
        {uploading && (
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-center gap-3">
              <i className="fas fa-spinner fa-spin text-blue-600 dark:text-blue-400"></i>
              <span className="text-sm text-blue-900 dark:text-blue-300">
                Téléchargement en cours...
              </span>
            </div>
          </div>
        )}

        {/* Documents Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-500 transition-colors group"
            >
              <div className="flex items-start gap-3">
                {/* File Icon */}
                <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded-lg flex-shrink-0">
                  <i className={`${getFileIcon(doc.type)} text-xl`}></i>
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                    {doc.name}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {doc.size}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {doc.date}
                    </span>
                  </div>
                  {doc.category && (
                    <span className="inline-block mt-2 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-xs rounded">
                      {doc.category}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(doc);
                    }}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    title="Télécharger"
                  >
                    <i className="fas fa-download text-slate-600 dark:text-slate-400"></i>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(doc.id);
                    }}
                    className="p-2 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    title="Supprimer"
                  >
                    <i className="fas fa-trash text-red-600 dark:text-red-400"></i>
                  </button>
                </div>
              </div>

              {/* Upload Progress (if applicable) */}
              {doc.uploadProgress !== undefined && doc.uploadProgress < 100 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-600 dark:text-slate-400">
                      Upload...
                    </span>
                    <span className="text-slate-600 dark:text-slate-400">
                      {doc.uploadProgress}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                    <div
                      className="bg-blue-600 h-1.5 rounded-full transition-all"
                      style={{ width: `${doc.uploadProgress}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Document Stats */}
        <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {documents.length}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Total documents
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {documents.filter(d => d.type === 'pdf').length}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                PDF
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {documents.filter(d => ['jpg', 'jpeg', 'png', 'gif'].includes(d.type)).length}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Images
              </p>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">
                {(documents.reduce((sum, d) => sum + (d.sizeBytes || 0), 0) / (1024 * 1024)).toFixed(1)} MB
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Taille totale
              </p>
            </div>
          </div>
        </div>
      </div>
    </ContentSection>
  );
}