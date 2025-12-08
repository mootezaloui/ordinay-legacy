import { useState } from "react";
import ContentSection from "../../layout/ContentSection";

/**
 * Notes Tab - Displays and manages notes
 * Works for any entity with a notes array
 */
export default function NotesTab({ data, config }) {
  const [notes, setNotes] = useState(data.notes || []);
  const [isAdding, setIsAdding] = useState(false);
  const [newNote, setNewNote] = useState("");

  const handleAddNote = () => {
    if (!newNote.trim()) return;

    const note = {
      id: Date.now(),
      date: new Date().toISOString().split('T')[0],
      author: "Me. Hammami", // TODO: Get from auth context
      content: newNote,
    };

    setNotes([note, ...notes]);
    setNewNote("");
    setIsAdding(false);
    
    // TODO: Save to backend
    console.log("Adding note:", note);
  };

  const handleDeleteNote = (noteId) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer cette note ?")) {
      setNotes(notes.filter(n => n.id !== noteId));
      // TODO: Delete from backend
      console.log("Deleting note:", noteId);
    }
  };

  if (notes.length === 0 && !isAdding) {
    return (
      <ContentSection title="Notes">
        <div className="p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
            <i className="fas fa-sticky-note text-slate-400 dark:text-slate-600 text-2xl"></i>
          </div>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Aucune note
          </p>
          <button
            onClick={() => setIsAdding(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            <i className="fas fa-plus mr-2"></i>
            Ajouter une note
          </button>
        </div>
      </ContentSection>
    );
  }

  return (
    <ContentSection title={`Notes (${notes.length})`}>
      <div className="p-6 space-y-4">
        {/* Add Note Form */}
        {isAdding ? (
          <div className="p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg">
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Écrivez votre note ici..."
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
              rows="4"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleAddNote}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                <i className="fas fa-save mr-2"></i>
                Enregistrer
              </button>
              <button
                onClick={() => {
                  setIsAdding(false);
                  setNewNote("");
                }}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="w-full py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-amber-500 dark:hover:border-amber-500 rounded-lg text-slate-600 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
          >
            <i className="fas fa-plus mr-2"></i>
            Ajouter une note
          </button>
        )}

        {/* Notes List */}
        {notes.map((note) => (
          <div
            key={note.id}
            className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg relative group"
          >
            <div className="flex items-start justify-between mb-2">
              <span className="text-sm font-medium text-slate-900 dark:text-white">
                {note.author}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {note.date}
                </span>
                <button
                  onClick={() => handleDeleteNote(note.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded transition-all"
                  title="Supprimer"
                >
                  <i className="fas fa-trash text-red-600 dark:text-red-400 text-sm"></i>
                </button>
              </div>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
              {note.content}
            </p>
          </div>
        ))}
      </div>
    </ContentSection>
  );
}