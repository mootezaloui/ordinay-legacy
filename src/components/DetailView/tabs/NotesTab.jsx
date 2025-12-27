import { useState, useEffect } from "react";
import { useToast } from "../../../contexts/ToastContext";
import ContentSection from "../../layout/ContentSection";

/**
 * Notes Tab - Displays and manages notes as a simple text field
 * Persists to backend via the onUpdate callback
 */
export default function NotesTab({ data, config, onUpdate }) {
  const { showToast } = useToast();
  const [notes, setNotes] = useState(data.notes || "");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Synchronize local notes state with parent data prop
  useEffect(() => {
    setNotes(data.notes || "");
  }, [data.notes]);

  const handleSave = async () => {
    if (!onUpdate) {
      console.error('[NotesTab] onUpdate callback not provided');
      showToast("Impossible to save notes", "error");
      return;
    }

    setIsSaving(true);
    try {
      // Call the onUpdate callback to save notes to backend
      await onUpdate({ notes });
      setIsEditing(false);
      showToast("Notes saved", "success");
    } catch (error) {
      console.error('[NotesTab] Error saving notes:', error);
      showToast("Error saving notes", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setNotes(data.notes || "");
    setIsEditing(false);
  };

  if (!notes && !isEditing) {
    return (
      <ContentSection title="Notes">
        <div className="p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/20 mb-4">
            <i className="fas fa-sticky-note text-amber-500 dark:text-amber-400 text-2xl"></i>
          </div>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            No notes
          </p>
          <button
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors"
          >
            <i className="fas fa-plus mr-2"></i>
            Add a note
          </button>
        </div>
      </ContentSection>
    );
  }

  return (
    <ContentSection title="Notes">
      <div className="p-6">
        {isEditing ? (
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border-2 border-amber-300 dark:border-amber-700 rounded-lg">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Écrivez vos notes ici... (Post-it virtuel)"
                className="w-full px-3 py-2 border border-amber-300 dark:border-amber-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                rows="12"
                autoFocus
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i>
                    Saving...
                  </>
                ) : (
                  <>
                    <i className="fas fa-save"></i>
                    Save
                  </>
                )}
              </button>
              <button
                onClick={handleCancel}
                disabled={isSaving}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-6 bg-amber-50 dark:bg-amber-900/10 border-2 border-amber-300 dark:border-amber-700 rounded-lg shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                  <i className="fas fa-sticky-note"></i>
                  <span className="font-semibold text-sm">Post-it</span>
                </div>
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-1.5 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded transition-colors"
                  title="Modifier"
                >
                  <i className="fas fa-edit text-amber-600 dark:text-amber-400"></i>
                </button>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                {notes}
              </p>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
              <i className="fas fa-info-circle mr-1"></i>
              Click the edit icon to modify your notes
            </p>
          </div>
        )}
      </div>
    </ContentSection>
  );
}