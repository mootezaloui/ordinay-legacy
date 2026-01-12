const express = require("express");
const router = express.Router();
const db = require("../db/connection");

/**
 * Notes Routes
 * Handles CRUD operations for the notes table
 * Notes are polymorphic - they can belong to any entity type
 */

// GET /api/notes?entity_type=mission&entity_id=123
// Get all notes for a specific entity
router.get("/", (req, res) => {
  try {
    const { entity_type, entity_id } = req.query;

    if (!entity_type || !entity_id) {
      return res.status(400).json({
        error: "entity_type and entity_id are required query parameters",
      });
    }

    const notes = db
      .prepare(
        `
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
    `
      )
      .all(entity_type, parseInt(entity_id));

    res.json(notes);
  } catch (error) {
    console.error("[Notes API] Error fetching notes:", error);
    res.status(500).json({ error: "Failed to fetch notes" });
  }
});

// GET /api/notes/:id
// Get a specific note by ID
router.get("/:id", (req, res) => {
  try {
    const note = db
      .prepare(
        `
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
      WHERE id = ? AND deleted_at IS NULL
    `
      )
      .get(parseInt(req.params.id));

    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }

    res.json(note);
  } catch (error) {
    console.error("[Notes API] Error fetching note:", error);
    res.status(500).json({ error: "Failed to fetch note" });
  }
});

// POST /api/notes
// Create a new note
router.post("/", (req, res) => {
  try {
    const { entity_type, entity_id, content, created_by } = req.body;

    if (!entity_type || !entity_id || !content) {
      return res.status(400).json({
        error: "entity_type, entity_id, and content are required",
      });
    }

    const result = db
      .prepare(
        `
      INSERT INTO notes (entity_type, entity_id, content, created_by)
      VALUES (?, ?, ?, ?)
    `
      )
      .run(entity_type, parseInt(entity_id), content, created_by || null);

    const note = db
      .prepare("SELECT * FROM notes WHERE id = ?")
      .get(result.lastInsertRowid);

    res.status(201).json(note);
  } catch (error) {
    console.error("[Notes API] Error creating note:", error);
    res.status(500).json({ error: "Failed to create note" });
  }
});

// PATCH /api/notes/:id
// Update an existing note
router.patch("/:id", (req, res) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: "content is required" });
    }

    db.prepare(
      `
      UPDATE notes
      SET content = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND deleted_at IS NULL
    `
    ).run(content, parseInt(req.params.id));

    const note = db
      .prepare("SELECT * FROM notes WHERE id = ?")
      .get(parseInt(req.params.id));

    if (!note) {
      return res.status(404).json({ error: "Note not found" });
    }

    res.json(note);
  } catch (error) {
    console.error("[Notes API] Error updating note:", error);
    res.status(500).json({ error: "Failed to update note" });
  }
});

// DELETE /api/notes/:id
// Hard delete a note (permanently remove from database)
router.delete("/:id", (req, res) => {
  try {
    db.prepare(
      `
      DELETE FROM notes WHERE id = ?
    `
    ).run(parseInt(req.params.id));

    res.status(204).send();
  } catch (error) {
    console.error("[Notes API] Error deleting note:", error);
    res.status(500).json({ error: "Failed to delete note" });
  }
});

// POST /api/notes/bulk-save
// Bulk save notes for an entity (used by frontend to save entire array)
router.post("/bulk-save", (req, res) => {
  try {
    const { entity_type, entity_id, notes } = req.body;

    if (!entity_type || !entity_id || !Array.isArray(notes)) {
      return res.status(400).json({
        error: "entity_type, entity_id, and notes array are required",
      });
    }

    // Start a transaction
    const transaction = db.transaction(() => {
      // Get existing notes for this entity
      const existingNotes = db
        .prepare(
          `
        SELECT id FROM notes
        WHERE entity_type = ? AND entity_id = ? AND deleted_at IS NULL
      `
        )
        .all(entity_type, parseInt(entity_id));

      const existingIds = existingNotes.map((n) => n.id);
      const incomingIds = notes
        .filter(
          (n) =>
            n.id &&
            typeof n.id === "number" &&
            n.id < Date.now() - 1000000000000
        )
        .map((n) => n.id);

      // Delete notes that are no longer in the incoming array (HARD DELETE)
      existingIds.forEach((id) => {
        if (!incomingIds.includes(id)) {
          db.prepare(
            `
            DELETE FROM notes WHERE id = ?
          `
          ).run(id);
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

      notes.forEach((note) => {
        if (
          note.id &&
          typeof note.id === "number" &&
          note.id < Date.now() - 1000000000000
        ) {
          // Existing note (has a real database ID)
          updateStmt.run(
            note.content,
            note.updatedAt || new Date().toISOString(),
            note.id
          );
        } else {
          // New note (frontend temporary ID)
          insertStmt.run(
            entity_type,
            parseInt(entity_id),
            note.content,
            note.createdAt || new Date().toISOString(),
            note.updatedAt || new Date().toISOString()
          );
        }
      });
    });

    transaction();

    // Return updated notes
    const savedNotes = db
      .prepare(
        `
      SELECT * FROM notes
      WHERE entity_type = ? AND entity_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
    `
      )
      .all(entity_type, parseInt(entity_id));

    res.json(savedNotes);
  } catch (error) {
    console.error("[Notes API] Error bulk saving notes:", error);
    res.status(500).json({ error: "Failed to save notes" });
  }
});

module.exports = router;
