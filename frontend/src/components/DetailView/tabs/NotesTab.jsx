import { useState, useEffect } from "react";
import { useToast } from "../../../contexts/ToastContext";
import { useConfirm } from "../../../contexts/ConfirmContext";
import ContentSection from "../../layout/ContentSection";
import { useTranslation } from "react-i18next";

/**
 * Notes Tab - Displays and manages multiple notes as post-its
 * Persists to backend via the onUpdate callback
 * ✅ UPDATED: Now supports multiple notes with add/edit/delete
 * ✅ FIXED: Supports different field names (notes, comments, etc.) via tabConfig
 */
export default function NotesTab({ data, config, tabConfig, onUpdate }) {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { t } = useTranslation("common");

  // ✅ Determine which field to use based on tab configuration
  // Default to "notes" for backward compatibility
  const fieldKey = tabConfig?.fieldKey || tabConfig?.id || "notes";

  // Parse notes: support both string (legacy) and array (new multi-note)
  const parseNotes = (notesData) => {
    if (!notesData) return [];
    if (Array.isArray(notesData)) return notesData;
    // Legacy: single string note → convert to array with one note
    return [{
      id: Date.now(),
      content: notesData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }];
  };

  const [notesList, setNotesList] = useState(() => parseNotes(data[fieldKey]));
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editContent, setEditContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Synchronize local notes state with parent data prop
  useEffect(() => {
    const parsed = parseNotes(data[fieldKey]);
    setNotesList(parsed);
  }, [data[fieldKey], fieldKey]);

  const handleAddNote = () => {
    const newNote = {
      id: Date.now(),
      content: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setEditingNoteId(newNote.id);
    setEditContent("");
    setNotesList([newNote, ...notesList]);
  };

  const handleEditNote = (note) => {
    setEditingNoteId(note.id);
    setEditContent(note.content);
  };

  const handleSaveNote = async () => {
    if (!onUpdate) {
      console.error('[NotesTab] onUpdate callback not provided');
      showToast(t("detail.notes.toast.error.saveMissing"), "error");
      return;
    }

    // Validate: don't allow empty notes
    if (!editContent.trim()) {
      showToast(t("detail.notes.toast.error.empty"), "error");
      return;
    }

    setIsSaving(true);
    try {
      // Update the note in the list
      const updatedNotes = notesList.map(note =>
        note.id === editingNoteId
          ? { ...note, content: editContent, updatedAt: new Date().toISOString() }
          : note
      );

      // Call the onUpdate callback to save notes array to backend
      // ✅ Use dynamic field key (notes, comments, etc.)
      await onUpdate({ [fieldKey]: updatedNotes });

      // ✅ DON'T update local state here - let useEffect sync from parent data
      // This ensures we get the corrected database IDs from the backend response
      // setNotesList(updatedNotes); // ❌ REMOVED

      setEditingNoteId(null);
      setEditContent("");
      showToast(t("detail.notes.toast.success.save"), "success");
    } catch (error) {
      console.error('[NotesTab] Error saving note:', error);
      showToast(t("detail.notes.toast.error.save"), "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    // If it's a new note (empty content), remove it
    const noteBeingEdited = notesList.find(n => n.id === editingNoteId);
    if (noteBeingEdited && !noteBeingEdited.content) {
      setNotesList(notesList.filter(n => n.id !== editingNoteId));
    }
    setEditingNoteId(null);
    setEditContent("");
  };

  const handleDeleteNote = async (noteId) => {
    const confirmed = await confirm({
      title: t("dialog.detail.notes.delete.title"),
      message: t("dialog.detail.notes.delete.message"),
      confirmText: t("dialog.detail.notes.delete.confirm"),
      cancelText: t("dialog.detail.notes.delete.cancel"),
      variant: "danger"
    });

    if (!confirmed) return;

    if (!onUpdate) {
      console.error('[NotesTab] onUpdate callback not provided');
      showToast(t("detail.notes.toast.error.deleteMissing"), "error");
      return;
    }

    setIsSaving(true);
    try {
      const updatedNotes = notesList.filter(note => note.id !== noteId);
      // ✅ Use dynamic field key (notes, comments, etc.)
      await onUpdate({ [fieldKey]: updatedNotes });

      // ✅ DON'T update local state here - let useEffect sync from parent data
      // setNotesList(updatedNotes); // ❌ REMOVED

      showToast(t("detail.notes.toast.success.delete"), "success");
    } catch (error) {
      console.error('[NotesTab] Error deleting note:', error);
      showToast(t("detail.notes.toast.error.delete"), "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Helper to get post-it color based on index
  const getPostItColor = (index) => {
    const colors = [
      { bg: "bg-amber-50 dark:bg-amber-900/10", border: "border-amber-300 dark:border-amber-700", text: "text-amber-700 dark:text-amber-300", icon: "text-amber-600 dark:text-amber-400" },
      { bg: "bg-blue-50 dark:bg-blue-900/10", border: "border-blue-300 dark:border-blue-700", text: "text-blue-700 dark:text-blue-300", icon: "text-blue-600 dark:text-blue-400" },
      { bg: "bg-green-50 dark:bg-green-900/10", border: "border-green-300 dark:border-green-700", text: "text-green-700 dark:text-green-300", icon: "text-green-600 dark:text-green-400" },
      { bg: "bg-pink-50 dark:bg-pink-900/10", border: "border-pink-300 dark:border-pink-700", text: "text-pink-700 dark:text-pink-300", icon: "text-pink-600 dark:text-pink-400" },
      { bg: "bg-purple-50 dark:bg-purple-900/10", border: "border-purple-300 dark:border-purple-700", text: "text-purple-700 dark:text-purple-300", icon: "text-purple-600 dark:text-purple-400" },
    ];
    return colors[index % colors.length];
  };

  const formatDate = (isoString) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    // Use i18n language for date formatting instead of hardcoded 'fr-FR'
    const locale = t("locale", { defaultValue: "en" });
    return date.toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  if (notesList.length === 0) {
    return (
      <ContentSection data-tutorial="dossier-notes-section" title={t("detail.notes.title")}>
        <div className="p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/20 mb-4">
            <i className="fas fa-sticky-note text-amber-500 dark:text-amber-400 text-2xl"></i>
          </div>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            {t("detail.notes.empty")}
          </p>
          <button
            onClick={handleAddNote}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors"
          >
            <i className="fas fa-plus mr-2"></i>
            {t("detail.notes.actions.addPostit")}
          </button>
        </div>
      </ContentSection>
    );
  }

  return (
    <ContentSection
      data-tutorial="dossier-notes-section"
      title={t("detail.notes.title")}
      actions={
        <button
          onClick={handleAddNote}
          className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors text-sm"
        >
          <i className="fas fa-plus mr-1.5"></i>
          {t("detail.notes.actions.addPostitShort")}
        </button>
      }
    >
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {notesList.map((note, index) => {
            const isEditing = editingNoteId === note.id;
            const colors = getPostItColor(index);

            return (
              <div
                key={note.id}
                className={`p-4 ${colors.bg} border-2 ${colors.border} rounded-lg shadow-sm hover:shadow-md transition-shadow`}
              >
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <i className={`fas fa-sticky-note ${colors.icon}`}></i>
                      <span className={`font-semibold text-sm ${colors.text}`}>{t("detail.notes.status.editing")}</span>
                    </div>
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      placeholder={t("detail.notes.placeholder.content")}
                      className={`w-full px-3 py-2 border ${colors.border} rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none`}
                      rows="8"
                      autoFocus
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSaveNote}
                        disabled={isSaving}
                        className="flex-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-400 text-white rounded-lg font-medium transition-colors text-sm"
                      >
                        {isSaving ? (
                          <>
                            <i className="fas fa-spinner fa-spin mr-1"></i>
                            {t("detail.notes.status.saving")}
                          </>
                        ) : (
                          <>
                            <i className="fas fa-save mr-1"></i>
                            {t("actions.save", { ns: "common" })}
                          </>
                        )}
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        disabled={isSaving}
                        className="flex-1 px-3 py-1.5 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors text-sm"
                      >
                        {t("actions.cancel", { ns: "common" })}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <i className={`fas fa-sticky-note ${colors.icon}`}></i>
                        <span className={`font-semibold text-xs ${colors.text}`}>{t("detail.notes.label.postit")}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEditNote(note)}
                          className="p-1 hover:bg-white/50 dark:hover:bg-slate-800/50 rounded transition-colors"
                          title={t("actions.edit", { ns: "common" })}
                        >
                          <i className={`fas fa-edit text-sm ${colors.icon}`}></i>
                        </button>
                        <button
                          onClick={() => handleDeleteNote(note.id)}
                          className="p-1 hover:bg-white/50 dark:hover:bg-slate-800/50 rounded transition-colors"
                          title={t("actions.delete", { ns: "common" })}
                        >
                          <i className="fas fa-trash text-sm text-red-600 dark:text-red-400"></i>
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed min-h-[120px]">
                      {note.content}
                    </p>
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {note.updatedAt && note.updatedAt !== note.createdAt ? (
                          <>
                            <i className="fas fa-clock mr-1"></i>
                            {t("detail.notes.time.updated")} {formatDate(note.updatedAt)}
                          </>
                        ) : (
                          <>
                            <i className="fas fa-calendar-plus mr-1"></i>
                            {t("detail.notes.time.created")} {formatDate(note.createdAt)}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </ContentSection>
  );
}
