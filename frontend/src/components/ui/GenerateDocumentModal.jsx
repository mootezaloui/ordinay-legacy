import { useState, useEffect } from 'react';
import templateService from '../../services/templateService';
import { useToast } from '../../contexts/ToastContext';
import templateManager from '../../services/templateManager';
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
    const [selectedTemplateId, setSelectedTemplateId] = useState(null);
    const [selectedLanguage, setSelectedLanguage] = useState('fr');
    const [templateOptions, setTemplateOptions] = useState([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedDoc, setGeneratedDoc] = useState(null);
    const [previewContent, setPreviewContent] = useState('');
    const [showPreview, setShowPreview] = useState(false);



    // Load template options when modal opens or entityType/language changes
    useEffect(() => {
        if (!isOpen || !entityType) return;
        const templates = templateManager.getAllTemplates(entityType, selectedLanguage);
        setTemplateOptions(templates);
        // Default to first template if none selected
        if (!selectedTemplateId && templates.length > 0) {
            setSelectedTemplateId(templates[0].id);
        }
    }, [isOpen, entityType, selectedLanguage]);

    // Helper to fill preview content with the chosen template and data
    const fillPreviewContent = () => {
        if (!entityType || !selectedTemplateId || !selectedLanguage) return;
        const data = templateService.extractEntityData(
            entityType,
            entityData,
            contextData
        );
        // Get template object
        const templateObj = templateManager.getTemplateById(selectedTemplateId);
        let templateContent = '';
        if (templateObj) {
            if (templateObj.template_type === 'user') {
                templateContent = templateObj.content;
            } else {
                // System template: map id to template key (e.g., 'jugement_request')
                // Example id: sys_dossier_jugement_fr => key: 'jugement_request'
                let templateKey = 'jugement_request';
                if (templateObj.id && templateObj.id.startsWith('sys_')) {
                    // Try to extract the template key from id
                    const parts = templateObj.id.split('_');
                    // e.g. ['sys','dossier','jugement','fr']
                    if (parts.length >= 3) {
                        // If the third part is 'jugement', use 'jugement_request'
                        if (parts[2] === 'jugement') templateKey = 'jugement_request';
                        // (extend here for more system templates)
                    }
                }
                templateContent = templateService.constructor.TEMPLATE_CONTENT?.[entityType]?.[templateKey]?.[selectedLanguage];
            }
        }
        if (!templateContent) {
            setPreviewContent('Erreur: contenu du modèle introuvable.');
            return;
        }
        const templateText = templateService.replacePlaceholders(
            templateContent,
            data
        );
        setPreviewContent(templateText.trim());
    };

    if (!isOpen) return null;

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            // Use previewContent as the template
            const result = await templateService.generateDocument(
                entityType,
                entityData,
                selectedTemplateId,
                selectedLanguage,
                contextData,
                previewContent // pass edited content
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
            const file = templateService.blobToFile(
                generatedDoc.blob,
                generatedDoc.fileName
            );
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
            if (onDocumentGenerated) {
                onDocumentGenerated(uploadResult.document);
            }
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
        setGeneratedDoc(null);
        onClose();
    };

    // Save and Download handler
    const handleSaveAndDownload = async () => {
        if (!generatedDoc) return;
        await handleSave();
        handleDownload();
        setGeneratedDoc(null);
        onClose();
    };

    const handleCancel = () => {
        setGeneratedDoc(null);
        setSelectedTemplateId(null);
        setSelectedLanguage('fr');
        onClose();
    };

    // If document generated, show save/download options
    if (generatedDoc) {
        // Print handler
        const handlePrint = () => {
            if (!generatedDoc) return;
            const url = URL.createObjectURL(generatedDoc.blob);
            const printWindow = window.open(url, '_blank');
            if (printWindow) {
                printWindow.onload = () => {
                    printWindow.focus();
                    printWindow.print();
                };
            }
        };
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" role="dialog" aria-modal="true">
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md mx-4">
                    {/* Header with close button */}
                    <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                            <i className="fas fa-check-circle text-green-600 dark:text-green-400 mr-2"></i>
                            Document généré
                        </h3>
                        <button
                            onClick={handleCancel}
                            aria-label="Fermer"
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        >
                            <i className="fas fa-times"></i>
                        </button>
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
                    <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 flex flex-col gap-3">
                        <button
                            onClick={handleSave}
                            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                        >
                            <i className="fas fa-save mr-2"></i>
                            Enregistrer
                        </button>
                        <button
                            onClick={handleDownload}
                            className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                        >
                            <i className="fas fa-download mr-2"></i>
                            Télécharger
                        </button>
                        <button
                            onClick={handleSaveAndDownload}
                            className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
                        >
                            <i className="fas fa-cloud-download-alt mr-2"></i>
                            Sauvegarder et télécharger
                        </button>
                        <button
                            onClick={handlePrint}
                            className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors"
                        >
                            <i className="fas fa-print mr-2"></i>
                            Imprimer
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Preview/edit step
    if (showPreview) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg mx-4">
                    <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                            <i className="fas fa-eye mr-2"></i>
                            Prévisualiser et éditer
                        </h3>
                        <button
                            onClick={handleCancel}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        >
                            <i className="fas fa-times"></i>
                        </button>
                    </div>
                    <div className="px-6 py-4">
                        <textarea
                            className="w-full h-80 p-3 border border-slate-300 dark:border-slate-600 rounded-lg font-mono text-sm bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                            value={previewContent}
                            onChange={e => setPreviewContent(e.target.value)}
                        />
                        <div className="flex justify-end gap-3 mt-4">
                            <button
                                onClick={() => setShowPreview(false)}
                                className="px-4 py-2 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors"
                            >
                                Retour
                            </button>
                            <button
                                onClick={handleGenerate}
                                disabled={isGenerating}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors"
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
                        </div>
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
                            {templateOptions.map((tpl) => (
                                <label key={tpl.id} className={`flex items-start gap-3 p-4 border-2 ${selectedTemplateId === tpl.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-blue-300'} rounded-lg cursor-pointer`}>
                                    <input
                                        type="radio"
                                        name="template"
                                        value={tpl.id}
                                        checked={selectedTemplateId === tpl.id}
                                        onChange={() => setSelectedTemplateId(tpl.id)}
                                        className="mt-1"
                                    />
                                    <div className="flex-1">
                                        <p className="font-medium text-slate-900 dark:text-white">
                                            {tpl.name}
                                            {tpl.template_type === 'user' && <span className="ml-2 px-2 py-0.5 text-xs bg-green-200 text-green-800 rounded">Perso</span>}
                                        </p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                            {tpl.language === 'ar' ? 'Arabe' : 'Français'}
                                        </p>
                                    </div>
                                </label>
                            ))}
                        </div>
                        {templateOptions.length === 0 && (
                            <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
                                Aucun modèle disponible pour ce type d'entité et cette langue.
                            </p>
                        )}
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

                    {/* Warning removed as requested */}
                </div>

                {/* Actions */}
                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 flex gap-3">
                    <button
                        onClick={() => {
                            fillPreviewContent();
                            setShowPreview(true);
                        }}
                        className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                    >
                        <i className="fas fa-eye mr-2"></i>
                        Prévisualiser et éditer
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