import { useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import templateService from '../../services/templateService';
import documentService from '../../services/documentService';

/**
 * Generate Document Modal
 * 
 * MVP - Simple template selection and generation
 * User chooses: template type + language
 * Then: save or download
 */
export default function GenerateDocumentModal({
    isOpen,
    onClose,
    entityType,
    entityData,
    contextData,
    onDocumentGenerated
}) {
    const { showToast } = useToast();
    const [selectedTemplate, setSelectedTemplate] = useState('jugement_request');
    const [selectedLanguage, setSelectedLanguage] = useState('fr');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedDoc, setGeneratedDoc] = useState(null);

    if (!isOpen) return null;

    const handleGenerate = async () => {
        setIsGenerating(true);

        try {
            // Map 'case' to 'proces' for templateService only
            const templateEntityType = entityType === 'case' ? 'proces' : entityType;
            const result = await templateService.generateDocument(
                templateEntityType,
                entityData,
                selectedTemplate,
                selectedLanguage,
                contextData
            );

            if (!result.success) {
                throw new Error(result.error);
            }

            setGeneratedDoc(result);
            showToast('Document généré avec succès', 'success');

        } catch (error) {
            console.error('[GenerateDocumentModal] Error:', error);
            showToast(`Erreur lors de la génération: ${error.message}`, 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSave = async () => {
        if (!generatedDoc) return;

        try {
            // Convert blob to File
            const file = templateService.blobToFile(
                generatedDoc.blob,
                generatedDoc.fileName
            );
            console.debug('[GenerateDocumentModal] File to upload:', file);
            // Upload to Documents tab
            const uploadResult = await documentService.uploadDocument(
                file,
                entityType,
                entityData.id,
                'Generated Document'
            );

            if (!uploadResult.success) {
                throw new Error(uploadResult.error);
            }

            showToast('Document enregistré dans l\'onglet Documents', 'success');

            // Notify parent to refresh
            if (onDocumentGenerated) {
                onDocumentGenerated(uploadResult.document);
            }

            // Reset and close
            setGeneratedDoc(null);
            onClose();

        } catch (error) {
            console.error('[GenerateDocumentModal] Save error:', error);
            showToast(`Erreur lors de l'enregistrement: ${error.message}`, 'error');
        }
    };

    const handleDownload = () => {
        if (!generatedDoc) return;

        templateService.downloadDocument(
            generatedDoc.blob,
            generatedDoc.fileName
        );

        showToast('Téléchargement du document...', 'success');

        // Reset and close
        setGeneratedDoc(null);
        onClose();
    };

    const handleCancel = () => {
        setGeneratedDoc(null);
        setSelectedTemplate('jugement_request');
        setSelectedLanguage('fr');
        onClose();
    };

    // If document generated, show save/download options
    if (generatedDoc) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md mx-4">
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                            <i className="fas fa-check-circle text-green-600 dark:text-green-400 mr-2"></i>
                            Document généré
                        </h3>
                    </div>

                    {/* Content */}
                    <div className="px-6 py-4">
                        <div className="mb-6">
                            <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                                <i className="fas fa-file-word text-green-600 dark:text-green-400 text-2xl mt-1"></i>
                                <div className="flex-1">
                                    <p className="font-medium text-slate-900 dark:text-white">
                                        {generatedDoc.fileName}
                                    </p>
                                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                                        Modèle: {generatedDoc.metadata.templateName}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
                                        Langue: {generatedDoc.metadata.language === 'ar' ? 'Arabe' : 'Français'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                            Que souhaitez-vous faire avec ce document ?
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 flex gap-3">
                        <button
                            onClick={handleSave}
                            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                        >
                            <i className="fas fa-save mr-2"></i>
                            Enregistrer
                        </button>
                        <button
                            onClick={handleDownload}
                            className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                        >
                            <i className="fas fa-download mr-2"></i>
                            Télécharger
                        </button>
                        <button
                            onClick={async () => {
                                // Save then download
                                if (!generatedDoc) return;
                                try {
                                    // Convert blob to File
                                    const file = templateService.blobToFile(
                                        generatedDoc.blob,
                                        generatedDoc.fileName
                                    );
                                    // Upload to Documents tab
                                    console.debug('[GenerateDocumentModal] File to upload (Save & Download):', file);
                                    const uploadResult = await documentService.uploadDocument(
                                        file,
                                        entityType,
                                        entityData.id,
                                        'Generated Document'
                                    );
                                    if (!uploadResult.success) {
                                        throw new Error(uploadResult.error);
                                    }
                                    showToast('Document enregistré dans l\'onglet Documents', 'success');
                                    // Notify parent to refresh
                                    if (onDocumentGenerated) {
                                        onDocumentGenerated(uploadResult.document);
                                    }
                                    // Download
                                    templateService.downloadDocument(
                                        generatedDoc.blob,
                                        generatedDoc.fileName
                                    );
                                    showToast('Téléchargement du document...', 'success');
                                    // Reset and close
                                    setGeneratedDoc(null);
                                    onClose();
                                } catch (error) {
                                    console.error('[GenerateDocumentModal] Save & Download error:', error);
                                    showToast(`Erreur lors de l\'enregistrement: ${error.message}`, 'error');
                                }
                            }}
                            className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
                        >
                            <i className="fas fa-save mr-2"></i>
                            Enregistrer & Télécharger
                        </button>
                        <button
                            onClick={handleCancel}
                            className="px-4 py-2 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors"
                        >
                            Annuler
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Template selection view
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg mx-4">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                            <i className="fas fa-file-alt mr-2"></i>
                            Générer un document
                        </h3>
                        <button
                            onClick={handleCancel}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        >
                            <i className="fas fa-times"></i>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="px-6 py-4 space-y-6">
                    {/* Entity Info */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Entité: <span className="font-medium text-slate-900 dark:text-white">
                                {entityType === 'proces' ? 'Procès' : 'Dossier'}
                            </span>
                        </p>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                            Référence: <span className="font-medium text-slate-900 dark:text-white">
                                {entityData.caseNumber}
                            </span>
                        </p>
                    </div>

                    {/* Template Selection */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            Type de document
                        </label>
                        <div className="space-y-2">
                            <label className="flex items-start gap-3 p-4 border-2 border-blue-500 bg-blue-50 dark:bg-blue-900/20 rounded-lg cursor-pointer">
                                <input
                                    type="radio"
                                    name="template"
                                    value="jugement_request"
                                    checked={selectedTemplate === 'jugement_request'}
                                    onChange={(e) => setSelectedTemplate(e.target.value)}
                                    className="mt-1"
                                />
                                <div className="flex-1">
                                    <p className="font-medium text-slate-900 dark:text-white">
                                        Demande d'extraction de jugement
                                    </p>
                                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                                        مطلب استخراج حكم
                                    </p>
                                </div>
                            </label>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
                            <i className="fas fa-info-circle mr-1"></i>
                            Seul ce type de document est disponible (MVP)
                        </p>
                    </div>

                    {/* Language Selection */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            Langue
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <label className={`flex items-center justify-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition-colors ${selectedLanguage === 'fr'
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-slate-200 dark:border-slate-700 hover:border-blue-300'
                                }`}>
                                <input
                                    type="radio"
                                    name="language"
                                    value="fr"
                                    checked={selectedLanguage === 'fr'}
                                    onChange={(e) => setSelectedLanguage(e.target.value)}
                                    className="hidden"
                                />
                                <i className="fas fa-flag text-blue-600 dark:text-blue-400"></i>
                                <span className="font-medium text-slate-900 dark:text-white">
                                    Français
                                </span>
                            </label>

                            <label className={`flex items-center justify-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition-colors ${selectedLanguage === 'ar'
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-slate-200 dark:border-slate-700 hover:border-blue-300'
                                }`}>
                                <input
                                    type="radio"
                                    name="language"
                                    value="ar"
                                    checked={selectedLanguage === 'ar'}
                                    onChange={(e) => setSelectedLanguage(e.target.value)}
                                    className="hidden"
                                />
                                <i className="fas fa-flag text-green-600 dark:text-green-400"></i>
                                <span className="font-medium text-slate-900 dark:text-white">
                                    العربية
                                </span>
                            </label>
                        </div>
                    </div>

                    {/* Warning */}
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                        <p className="text-sm text-amber-800 dark:text-amber-300">
                            <i className="fas fa-exclamation-triangle mr-2"></i>
                            Les champs manquants seront remplacés par des lignes vides (__________)
                        </p>
                    </div>
                </div>

                {/* Actions */}
                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 flex gap-3">
                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating}
                        className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors"
                    >
                        {isGenerating ? (
                            <>
                                <i className="fas fa-spinner fa-spin mr-2"></i>
                                Génération...
                            </>
                        ) : (
                            <>
                                <i className="fas fa-file-alt mr-2"></i>
                                Générer le document
                            </>
                        )}
                    </button>
                    <button
                        onClick={handleCancel}
                        disabled={isGenerating}
                        className="px-4 py-2 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                        Annuler
                    </button>
                </div>
            </div>
        </div>
    );
}