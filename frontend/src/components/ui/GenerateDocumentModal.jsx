import { useEffect, useMemo, useState } from "react";
import templateService from "../../services/templateService";
import { useToast } from "../../contexts/ToastContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import templateManager from "../../services/templateManager";
import documentService from "../../services/documentService";

/**
 * Generate Document Modal
 *
 * MVP - Simple template selection and generation.
 * User chooses: template + language, then generates a DOCX file.
 */
export default function GenerateDocumentModal({
    isOpen,
    onClose,
    entityType,
    entityData,
    contextData,
    onDocumentGenerated,
}) {
    const { showToast } = useToast();
    const { confirm } = useConfirm();
    const [selectedTemplateId, setSelectedTemplateId] = useState(null);
    const [selectedLanguage, setSelectedLanguage] = useState("fr");
    const [templateOptions, setTemplateOptions] = useState([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [selectedVariantKey, setSelectedVariantKey] = useState(null);
    const [generatedDoc, setGeneratedDoc] = useState(null);
    const [savedDocument, setSavedDocument] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    useEffect(() => {
        if (!isOpen || !entityType) return;
        const templates = templateManager.getAllTemplates(
            entityType,
            selectedLanguage
        );
        setTemplateOptions(templates);
        const hasSelected = templates.some((tpl) => tpl.id === selectedTemplateId);
        if (templates.length === 0) {
            setSelectedTemplateId(null);
        } else if (!hasSelected) {
            setSelectedTemplateId(templates[0].id);
        }
    }, [isOpen, entityType, selectedLanguage]);

    useEffect(() => {
        if (!selectedTemplateId) {
            setSelectedVariantKey(null);
            return;
        }
        const template = templateOptions.find((tpl) => tpl.id === selectedTemplateId);
        const variants = Array.isArray(template?.variants) ? template.variants : [];
        if (variants.length === 0) {
            setSelectedVariantKey(null);
            return;
        }
        const stillValid = variants.some((variant) => variant.key === selectedVariantKey);
        if (!stillValid) {
            setSelectedVariantKey(null);
        }
    }, [selectedTemplateId, templateOptions, selectedVariantKey]);

    useEffect(() => {
        if (!isOpen) return;
        setGeneratedDoc(null);
        setSavedDocument(null);
    }, [isOpen, selectedTemplateId, selectedLanguage, selectedVariantKey, entityType, entityData?.id]);

    const selectedTemplate = templateOptions.find(
        (tpl) => tpl.id === selectedTemplateId
    );
    const requiredFields = Array.isArray(selectedTemplate?.required_fields)
        ? selectedTemplate.required_fields
        : [];
    const variantOptions = Array.isArray(selectedTemplate?.variants)
        ? selectedTemplate.variants
        : [];

    const buildWarnings = () => {
        const data = templateService.extractEntityData(
            entityType,
            entityData || {},
            contextData || {}
        );
        const missingFields = [];
        const unknownFields = [];
        requiredFields.forEach((field) => {
            if (!Object.prototype.hasOwnProperty.call(data, field)) {
                unknownFields.push(field);
                return;
            }
            if (templateService.isMissingValue(data[field])) {
                missingFields.push(field);
            }
        });

        const needsVariant = variantOptions.length > 0 && !selectedVariantKey;

        return {
            missingFields,
            unknownFields,
            needsVariant,
        };
    };

    const handleGenerate = async () => {
        if (!selectedTemplateId) return;
        const { missingFields, unknownFields, needsVariant } = buildWarnings();
        if (missingFields.length > 0 || unknownFields.length > 0 || needsVariant) {
            const lines = [];
            if (missingFields.length > 0) {
                lines.push(`Champs manquants: ${missingFields.join(", ")}`);
            }
            if (unknownFields.length > 0) {
                lines.push(`Champs inconnus: ${unknownFields.join(", ")}`);
            }
            if (needsVariant) {
                lines.push("Aucune variante selectionnee.");
            }
            const confirmed = await confirm({
                title: "Donnees manquantes",
                message: `Certaines données sont manquantes. Générer quand même?\n\n${lines.join("\n")}`,
                confirmText: "Générer",
                cancelText: "Annuler",
                variant: "warning",
            });
            if (!confirmed) {
                return;
            }
        }

        setIsGenerating(true);
        try {
            const result = await templateService.generateDocument(
                entityType,
                entityData,
                selectedTemplateId,
                selectedLanguage,
                contextData,
                { variantKey: selectedVariantKey }
            );
            if (!result?.success) {
                throw new Error(result?.error || "Generation failed");
            }
            setGeneratedDoc({
                blob: result.blob,
                fileName: result.fileName,
                templateName: selectedTemplate?.name || "Document",
                language: selectedLanguage,
            });
            setSavedDocument(null);
            showToast("Document généré. Choisissez une action.", "success");
        } catch (error) {
            console.error("[GenerateDocumentModal] Error:", error);
            showToast(`Erreur lors de la génération: ${error.message}`, "error");
        } finally {
            setIsGenerating(false);
        }
    };

    const downloadBlob = (blob, fileName) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName || "document.docx";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 200);
    };

    const saveDocument = async () => {
        if (!generatedDoc) return null;
        if (!entityData?.id) {
            showToast("Impossible d'enregistrer: entite introuvable.", "error");
            return null;
        }
        if (savedDocument) {
            return savedDocument;
        }
        setIsSaving(true);
        try {
            const file = templateService.blobToFile(
                generatedDoc.blob,
                generatedDoc.fileName
            );
            const uploadResult = await documentService.uploadDocument(
                file,
                entityType,
                entityData.id,
                "Generated Document"
            );
            if (!uploadResult.success) {
                throw new Error(uploadResult.error);
            }
            setSavedDocument(uploadResult.document);
            if (onDocumentGenerated) {
                onDocumentGenerated(uploadResult.document);
            }
            showToast("Document enregistré dans l'onglet Documents.", "success");
            return uploadResult.document;
        } catch (error) {
            console.error("[GenerateDocumentModal] Save error:", error);
            showToast(`Erreur lors de l'enregistrement: ${error.message}`, "error");
            return null;
        } finally {
            setIsSaving(false);
        }
    };

    const handleSave = async () => {
        const saved = await saveDocument();
        if (saved) {
            handleCancel();
        }
    };

    const handleDownload = async () => {
        if (!generatedDoc) return;
        setIsDownloading(true);
        try {
            downloadBlob(generatedDoc.blob, generatedDoc.fileName);
            handleCancel();
        } finally {
            setIsDownloading(false);
        }
    };

    const handleSaveAndDownload = async () => {
        if (!generatedDoc) return;
        const saved = await saveDocument();
        if (saved) {
            downloadBlob(generatedDoc.blob, generatedDoc.fileName);
            handleCancel();
        }
    };

    const handleCancel = () => {
        setSelectedTemplateId(null);
        setSelectedLanguage("fr");
        setSelectedVariantKey(null);
        setGeneratedDoc(null);
        setSavedDocument(null);
        onClose();
    };

    const entityRéférence = useMemo(() => {
        const data = templateService.extractEntityData(
            entityType,
            entityData || {},
            contextData || {}
        );
        const resolved =
            entityType === "proces"
                ? data["proces.reference"]
                : entityType === "session"
                ? data["session.date"] || data["proces.reference"] || data["dossier.reference"]
                : data["dossier.reference"];
        return (
            resolved ||
            entityData?.caseNumber ||
            entityData?.reference ||
            entityData?.id ||
            "-"
        );
    }, [entityType, entityData, contextData]);

    if (!isOpen) return null;

    if (generatedDoc) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md mx-4">
                    <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white truncate">
                            <i className="fas fa-check-circle text-green-600 dark:text-green-400 mr-2"></i>
                            Document généré
                        </h3>
                        <button
                            onClick={handleCancel}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        >
                            <i className="fas fa-times"></i>
                        </button>
                    </div>

                    <div className="px-6 py-4 space-y-4">
                        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-4">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white break-words">
                                {generatedDoc.fileName}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                Modèle: {generatedDoc.templateName}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                Langue: {generatedDoc.language === "ar" ? "Arabe" : "Français"}
                            </p>
                            {savedDocument && (
                                <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                                    Enregistré dans Documents.
                                </p>
                            )}
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                            <button
                                onClick={handleSave}
                                disabled={isSaving || !!savedDocument}
                                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg font-medium transition-colors"
                            >
                                <i className="fas fa-save mr-2"></i>
                                Enregistrer
                            </button>
                            <button
                                onClick={handleDownload}
                                disabled={isDownloading}
                                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors"
                            >
                                <i className="fas fa-download mr-2"></i>
                                Télécharger
                            </button>
                            <button
                                onClick={handleSaveAndDownload}
                                disabled={isSaving}
                                className="w-full px-4 py-2 border border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-500 dark:text-blue-200 dark:hover:bg-blue-900/30 rounded-lg font-medium transition-colors"
                            >
                                <i className="fas fa-save mr-2"></i>
                                Enregistrer + Télécharger
                            </button>
                        </div>
                    </div>

                    <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 flex justify-end">
                        <button
                            onClick={handleCancel}
                            className="px-4 py-2 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors"
                        >
                            Fermer
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg mx-4">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white truncate">
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

                <div className="px-6 py-4 space-y-6">
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-blue-50 dark:bg-blue-900/20 p-4">
                        <p className="text-sm text-blue-800 dark:text-blue-300">
                            Choisissez un modèle, puis cliquez sur “Générer”. Organia remplit automatiquement les informations du dossier.
                        </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 p-4 space-y-6">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                            Configuration
                        </p>
                        <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                Entité:{" "}
                                <span className="font-medium text-slate-900 dark:text-white">
                                    {entityType === "proces" ? "Procès" : entityType === "session" ? "Audience" : "Dossier"}
                                </span>
                            </p>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                                Référence:{" "}
                                <span className="font-medium text-slate-900 dark:text-white">
                                    {entityRéférence}
                                </span>
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                Type de document
                            </label>
                            <div className="space-y-2">
                                {templateOptions.map((tpl) => (
                                    <label
                                        key={tpl.id}
                                        className={`flex items-start gap-3 p-4 border-2 ${
                                            selectedTemplateId === tpl.id
                                                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                                                : "border-slate-200 dark:border-slate-700 hover:border-blue-300"
                                        } rounded-lg cursor-pointer`}
                                    >
                                        <input
                                            type="radio"
                                            name="template"
                                            value={tpl.id}
                                            checked={selectedTemplateId === tpl.id}
                                            onChange={() => setSelectedTemplateId(tpl.id)}
                                            className="mt-1"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="font-medium text-slate-900 dark:text-white break-words">
                                                {tpl.name}
                                                {tpl.template_type === "user" && (
                                                    <span className="ml-2 px-2 py-0.5 text-xs bg-green-200 text-green-800 rounded">
                                                        Perso
                                                    </span>
                                                )}
                                            </p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                                {tpl.language === "ar" ? "Arabe" : "Français"}
                                            </p>
                                        </div>
                                    </label>
                                ))}
                            </div>
                            {templateOptions.length === 0 && (
                                <p className="text-xs text-slate-500 dark:text-slate-500 mt-2">
                                    Aucun modèle disponible pour ce type d'entité et cette langue. Créez-en un dans Paramètres → Documents.
                                </p>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                Langue
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <label
                                    className={`flex items-center justify-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition-colors ${
                                        selectedLanguage === "fr"
                                            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                                            : "border-slate-200 dark:border-slate-700 hover:border-blue-300"
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="language"
                                        value="fr"
                                        checked={selectedLanguage === "fr"}
                                        onChange={(e) => setSelectedLanguage(e.target.value)}
                                        className="hidden"
                                    />
                                    <i className="fas fa-flag text-blue-600 dark:text-blue-400"></i>
                                    <span className="font-medium text-slate-900 dark:text-white">
                                        Français
                                    </span>
                                </label>

                                <label
                                    className={`flex items-center justify-center gap-2 p-3 border-2 rounded-lg cursor-pointer transition-colors ${
                                        selectedLanguage === "ar"
                                            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                                            : "border-slate-200 dark:border-slate-700 hover:border-blue-300"
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="language"
                                        value="ar"
                                        checked={selectedLanguage === "ar"}
                                        onChange={(e) => setSelectedLanguage(e.target.value)}
                                        className="hidden"
                                    />
                                    <i className="fas fa-flag text-green-600 dark:text-green-400"></i>
                                    <span className="font-medium text-slate-900 dark:text-white">
                                        Arabe
                                    </span>
                                </label>
                            </div>
                        </div>

                        {variantOptions.length > 0 && (
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Variante
                                </label>
                                <div className="space-y-2">
                                    {variantOptions.map((variant) => (
                                        <label
                                            key={variant.key}
                                            className={`flex items-start gap-3 p-3 border-2 ${
                                                selectedVariantKey === variant.key
                                                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                                                    : "border-slate-200 dark:border-slate-700 hover:border-blue-300"
                                            } rounded-lg cursor-pointer`}
                                        >
                                            <input
                                                type="radio"
                                                name="variant"
                                                value={variant.key}
                                                checked={selectedVariantKey === variant.key}
                                                onChange={() => setSelectedVariantKey(variant.key)}
                                                className="mt-1"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-slate-900 dark:text-white break-words">
                                                    {variant.label || variant.key}
                                                </p>
                                                {variant.description && (
                                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                                        {variant.description}
                                                    </p>
                                                )}
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Le document sera généré au format Word (.docx) et pourra être ouvert
                            et modifié avec votre éditeur habituel.
                        </p>
                    </div>
                </div>

                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 flex gap-3">
                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating || !selectedTemplateId}
                        className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors"
                    >
                        {isGenerating ? (
                            <>
                                <i className="fas fa-spinner fa-spin mr-2"></i>
                                Génération...
                            </>
                        ) : (
                            <>
                                <i className="fas fa-check mr-2"></i>
                                Générer le document
                            </>
                        )}
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
