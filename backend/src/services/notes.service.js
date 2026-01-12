const db = require('../db/connection');

/**
 * Notes Service
 * Helper functions to manage notes for any entity type
 */

/**
 * Get all notes for an entity
 * @param {string} entityType - Type of entity (mission, dossier, case, etc.)
 * @param {number} entityId - ID of the entity
 * @returns {Array} Array of notes
 */
function getNotesForEntity(entityType, entityId) {
  return db.prepare(`
    SELECT
      id,
      entity_type,
      entity_id,
      content,
      created_by,
      created_at,
      updated_at,
      deleted_at
    FROM notes
    WHERE entity_type = ? AND entity_id = ? AND deleted_at IS NULL
    ORDER BY created_at DESC
  `).all(entityType, entityId);
}

/**
 * Save notes array for an entity (bulk save)
 * Handles insert/update/delete based on incoming array
 * @param {string} entityType - Type of entity
 * @param {number} entityId - ID of the entity
 * @param {Array} notesArray - Array of note objects from frontend
 * @returns {Array} Updated array of notes
 */
function saveNotesForEntity(entityType, entityId, notesArray) {
  if (!Array.isArray(notesArray)) {
    throw new Error('Notes must be an array');
  }

  console.log('[notes.service] saveNotesForEntity called:', {
    entityType,
    entityId,
    notesArrayLength: notesArray.length,
    notesArray: JSON.stringify(notesArray, null, 2)
  });

  // Start a transaction
  const transaction = db.transaction(() => {
    // Get existing notes for this entity
    const existingNotes = db.prepare(`
      SELECT id FROM notes
      WHERE entity_type = ? AND entity_id = ? AND deleted_at IS NULL
    `).all(entityType, entityId);

    const existingIds = existingNotes.map(n => n.id);

    // Frontend uses Date.now() for temporary IDs, which are very large numbers
    // Real database IDs are much smaller (sequential integers)
    // We consider IDs < 1000000 as real database IDs
    const incomingIds = notesArray
      .filter(n => n.id && typeof n.id === 'number' && n.id < 1000000)
      .map(n => n.id);

    console.log('[notes.service] IDs comparison:', {
      existingIds,
      incomingIds,
      toDelete: existingIds.filter(id => !incomingIds.includes(id))
    });

    // Delete notes that are no longer in the incoming array (HARD DELETE)
    existingIds.forEach(id => {
      if (!incomingIds.includes(id)) {
        console.log('[notes.service] Hard-deleting note ID:', id);
        db.prepare(`
          DELETE FROM notes WHERE id = ?
        `).run(id);
      }
    });

    // Insert or update notes
    const insertStmt = db.prepare(`
      INSERT INTO notes (entity_type, entity_id, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const updateStmt = db.prepare(`
      UPDATE notes
      SET content = ?, updated_at = ?
      WHERE id = ?
    `);

    notesArray.forEach(note => {
      if (!note.content || !note.content.trim()) {
        // Skip empty notes
        return;
      }

      if (note.id && typeof note.id === 'number' && note.id < 1000000) {
        // Existing note (has a real database ID)
        updateStmt.run(
          note.content,
          note.updatedAt || new Date().toISOString(),
          note.id
        );
      } else {
        // New note (frontend temporary ID or no ID)
        insertStmt.run(
          entityType,
          entityId,
          note.content,
          note.createdAt || new Date().toISOString(),
          note.updatedAt || new Date().toISOString()
        );
      }
    });
  });

  transaction();

  // Return updated notes
  return getNotesForEntity(entityType, entityId);
}

/**
 * Delete all notes for an entity (used when entity is deleted) - HARD DELETE
 * @param {string} entityType - Type of entity
 * @param {number} entityId - ID of the entity
 */
function deleteNotesForEntity(entityType, entityId) {
  db.prepare(`
    DELETE FROM notes
    WHERE entity_type = ? AND entity_id = ?
  `).run(entityType, entityId);
}

module.exports = {
  getNotesForEntity,
  saveNotesForEntity,
  deleteNotesForEntity,
};
