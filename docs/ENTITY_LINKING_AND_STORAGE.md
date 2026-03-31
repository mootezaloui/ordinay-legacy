# Entity Linking & Storage — How the Agent Knows Where Things Go

## The Question

When the agent creates something (document, task, entity), how does it 
know which entity to link it to? How does it know to store a generated 
letter in dossier D-42 and not D-43?

## The Answer: Three Mechanisms

### 1. Session Context (conversation memory)

If the user has been discussing dossier D-42, that entity is in 
`session.activeEntities`. The LLM sees this context and uses the 
correct IDs automatically.

```
Turn 1: "Show me Bouazizi's commercial dossier"
  → session.activeEntities = { 
      client:1234, dossier:42, lawsuit:5001 
    }

Turn 5: "Save this letter to the dossier"
  → LLM knows "the dossier" = D-42 from session context
  → Calls proposeCreate({ 
      entityType: "document",
      data: { title: "...", content: "..." },
      linkedTo: { entityType: "dossier", entityId: 42 }
    })
```

### 2. READ Tool Chaining (gather before acting)

When the user asks about something new, the LLM fetches data first:

```
User: "Generate a letter for the Mansouri property case"

LLM step 1: searchClients("Mansouri") → client C-2002
LLM step 2: listDossiers(clientId: 2002) → finds D-52 "property claim"
LLM step 3: getEntityGraph("dossier", 52) → full case details

Now the LLM has: client ID, dossier ID, lawsuit ID, court details.
It passes these when calling generateDraft:

LLM step 4: generateDraft({
  draftType: "court_letter",
  title: "...",
  sections: [...],
  linkedEntityType: "dossier",    ← knows this from step 2
  linkedEntityId: 52,              ← knows this from step 2
  metadata: {
    client: "Mansouri",
    dossier: "D-52 — Property claim",
    court: "Tribunal de Tunis"     ← knows from step 3
  }
})
```

### 3. Explicit User Input (when ambiguous)

If the LLM can't determine the link, it asks:

```
User: "Add a document to the dossier"
  → Multiple dossiers in session? LLM asks which one.
  → No dossier in session? LLM asks: "Which dossier?"

User: "Save this letter"
  → Draft has linkedEntityId already? Use it.
  → Draft has no link? LLM asks: "Where should I save this? 
    I see you have dossiers D-42 and D-52 active."
```

## Complete Flow Traces

### Flow A: Generate a letter and save it

```
Turn 1: "Write a postponement letter for the Bouazizi hearing"

  LLM calls: searchClients("Bouazizi") → C-1234
  LLM calls: getEntityGraph("client", 1234, depth:2)
    → dossier D-42, lawsuit L-5001, session S-801 (March 25)
  
  LLM calls: generateDraft({
    draftType: "court_letter",
    title: "Request for Postponement",
    linkedEntityType: "dossier",      ← set by LLM from context
    linkedEntityId: 42,                ← set by LLM from context
    sections: [...],
    layout: { direction: "ltr", language: "fr", ... }
  })
  
  → Draft Card appears
  → session.currentDraft = { ..., linkedEntityType: "dossier", linkedEntityId: 42 }

Turn 2: "Save it to the dossier"

  LLM sees: session.currentDraft exists with linkedEntityId: 42
  LLM calls: proposeCreate({
    entityType: "document",
    data: {
      title: "Request for Postponement — March 25 hearing",
      type: "court_letter",
      content: session.currentDraft.content,
      dossier_id: 42,                 ← from the draft's linkedEntityId
      lawsuit_id: 5001,               ← from session.activeEntities
    },
    linkedTo: { entityType: "dossier", entityId: 42 }
  })

  → Plan Card appears:
    "Create document 'Request for Postponement' in Dossier D-42?"
  
Turn 3: "Yes"
  → Entity executor: documentsService.create({
      title: "Request for Postponement — March 25 hearing",
      type: "court_letter",
      dossier_id: 42,
      lawsuit_id: 5001,
      ...
    })
  → Document created, linked to D-42 and L-5001
```

### Flow B: Create an entity linked to another

```
Turn 1: "We're working on dossier D-42 today"
  LLM calls: getDossier(42) → loads dossier
  → session.activeEntities = { dossier:42, client:1234 }

Turn 2: "Create a task to prepare exhibits"
  LLM sees: dossier D-42 in context
  LLM calls: proposeCreate({
    entityType: "task",
    data: {
      title: "Prepare exhibits",
      status: "pending",
      dossier_id: 42,              ← from session context
    },
    linkedTo: { entityType: "dossier", entityId: 42 }
  })

  → Plan Card: "Create task 'Prepare exhibits' in Dossier D-42?"

Turn 3: "Yes, and make it urgent with a deadline of March 20"
  → Turn classifier: AMENDMENT (pending exists + modification language)
  → LLM re-proposes with updated params:
  
  proposeCreate({
    entityType: "task",
    data: {
      title: "Prepare exhibits",
      status: "pending",
      priority: "urgent",           ← added from amendment
      due_date: "2026-03-20",       ← added from amendment
      dossier_id: 42,
    },
    linkedTo: { entityType: "dossier", entityId: 42 }
  })

  → Updated Plan Card

Turn 4: "Confirm"
  → tasksService.create({ title: "Prepare exhibits", priority: "urgent", 
      due_date: "2026-03-20", dossier_id: 42 })
  → Task created, linked to D-42
```

### Flow C: Move/link a document to a different entity

```
Turn 1: "I have document DOC-201, move it to lawsuit L-5001"

  LLM calls: getDocument(201) → gets current document
    → Currently linked to dossier_id: 42, lawsuit_id: null
  
  LLM calls: proposeUpdate({
    entityType: "document",
    entityId: 201,
    changes: {
      lawsuit_id: 5001               ← the new link
    },
    reason: "Link document to lawsuit L-5001"
  })

  → Plan Card shows:
    "Update document DOC-201:
     lawsuit_id: (none) → L-5001"

Turn 2: "Yes"
  → documentsService.update(201, { lawsuit_id: 5001 })
  → Document now linked to L-5001
```

### Flow D: Ambiguous linking — agent asks

```
Turn 1: "Save this document"

  session.currentDraft exists but linkedEntityId is null
  (maybe the draft was created without specific context)

  LLM sees: no linked entity on the draft
  LLM sees: session.activeEntities has dossier:42 and dossier:52

  LLM responds:
    "Where should I save this document? You have two dossiers 
     in this conversation:
     1. D-42 — Bouazizi v. TechPro
     2. D-52 — Mansouri property claim
     Which one?"

Turn 2: "The first one"
  → LLM resolves "the first one" = D-42 from the list above
  → proposeCreate({ entityType: "document", data: { dossier_id: 42, ... } })
  → Plan Card appears
```

## What Makes This Work — The System Prompt

The system prompt instructs the LLM to always include linking information:

```
ENTITY LINKING:

When creating or saving any entity, ALWAYS specify which parent entity 
it belongs to. Use the IDs from your READ tool results or session context.

For documents: always include dossier_id and optionally lawsuit_id
For tasks: always include dossier_id or lawsuit_id
For sessions: always include lawsuit_id or dossier_id
For missions: always include dossier_id or lawsuit_id
For financial entries: always include dossier_id

If you don't know which entity to link to:
- Check session context (active entities from the conversation)
- If ambiguous, ASK the user which entity
- NEVER create an unlinked entity without asking first

When saving a draft document:
- Use the linkedEntityType and linkedEntityId from the draft metadata
- If the draft has no link, ask the user where to save it
```

## What About File Storage?

When a document is "saved," two things happen:

1. A document RECORD is created in the database (title, type, links)
2. The document CONTENT is saved to the file system

The entity executor handles both:

```typescript
// In entity.executor.ts — special handling for document creation

case 'document':
  // 1. Save content to file system
  const filePath = await saveDocumentFile(data.content, data.title, data.format);
  
  // 2. Create database record with file path
  const docRecord = documentsService.create({
    title: data.title,
    type: data.type,
    file_path: filePath,
    dossier_id: data.dossier_id,
    lawsuit_id: data.lawsuit_id,
    // ... other links
  });
  
  return docRecord;
```

The file system path is determined by configuration (the app's 
documents directory), not by the LLM. The LLM only specifies 
WHICH entity to link to, not WHERE on disk to store.

## Is This Covered by Design?

```
MECHANISM                              STATUS
─────────────────────                  ──────
Session context carries entity IDs     ✅ Designed + implemented
LLM chains READ before PLAN/DRAFT     ✅ Designed (system prompt)
Draft stores linkedEntityType/Id       ✅ Designed in DRAFT phase
proposeCreate has linkedTo field       ✅ Designed in PLAN phase
proposeUpdate can modify links         ✅ Designed in PLAN phase
Ambiguity handling (ask user)          ✅ Designed (system prompt)
System prompt linking instructions     🔄 Need to add (see above)
File storage on document save          🔄 Need to add to entity.executor
Entity executor document handling      🔄 Need to add special case
```

## Action Items

```
Task 1: Add entity linking instructions to system prompt
  File: agent/prompts/identity.prompt.ts
  Add the ENTITY LINKING section (see above)

Task 2: Add document file storage to entity executor
  File: agent/engine/entity.executor.ts
  Special handling for entityType "document":
  - Save content to file system
  - Set file_path on the database record
  - Handle format (PDF/DOCX rendering if needed)

Task 3: Ensure Draft Card preserves linking info
  File: verify generateDraft tool output includes linkedEntityType/Id
  And that session.currentDraft carries this through

Task 4: Test the full save flow
  "Write a letter for D-42" → Draft Card
  "Save it" → Plan Card (create document in D-42)
  "Confirm" → Document created, file saved, linked to D-42
```
