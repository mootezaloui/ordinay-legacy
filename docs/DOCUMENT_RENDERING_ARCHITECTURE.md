# Document Rendering Architecture

## The Problem

The agent generates document text. It needs to be:

1. Rendered as a beautiful, properly structured document (not plain text)
2. Editable by lawyers without exposing HTML/markup
3. Flexible enough for any document type, language, or format
4. Not dependent on hardcoded templates

## The Solution: Structured Sections + Semantic Renderer

The LLM doesn't output plain text OR html. It outputs a **structured
section array** — a list of content blocks, each tagged with a semantic
role. A generic renderer turns those sections into visual layout.

```
┌─────────────────────────────────────────────────────────┐
│ LLM generates structured sections                        │
│                                                          │
│ [                                                        │
│   { role: "date", text: "Tunis, le 18 mars 2026" },     │
│   { role: "recipient", text: "M. le Président..." },     │
│   { role: "reference", text: "Affaire n° 2025/COM/1847" },│
│   { role: "subject", label: "Objet:", text: "Demande..." },│
│   { role: "salutation", text: "Monsieur le Président," }, │
│   { role: "body", text: "Nous avons l'honneur..." },     │
│   { role: "body", text: "En raison de..." },              │
│   { role: "closing", text: "Veuillez agréer..." },        │
│   { role: "signature_name", text: "Me. Karim Jebali" },   │
│   { role: "signature_detail", text: "Avocat au Barreau" },│
│ ]                                                        │
│                                                          │
│ + layout hints:                                          │
│   { direction: "ltr", language: "fr", formality: "formal",│
│     documentClass: "court_letter" }                      │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│ Renderer interprets roles into visual layout             │
│                                                          │
│ "date" → right-aligned, italic, muted color              │
│ "recipient" → left-aligned block, medium weight          │
│ "reference" → small caps or monospace, muted             │
│ "subject" → label bold + text, emphasized                │
│ "salutation" → serif, normal weight                      │
│ "body" → serif, justified, comfortable line height       │
│ "closing" → serif, normal weight                         │
│ "signature_name" → italic, bold, right-aligned           │
│ "signature_detail" → small, muted, right-aligned         │
│                                                          │
│ Direction/language adjustments:                          │
│ direction: "rtl" → flip all alignments                  │
│ language: "ar" → Arabic-appropriate font + spacing       │
│ formality: "formal" → serif, more spacing               │
│ formality: "casual" → sans-serif, tighter               │
└─────────────────────────────────────────────────────────┘
```

## Why This Works

**No templates needed.** The LLM decides what sections to include
based on the document type. A court letter has date → recipient →
reference → subject → salutation → body → closing → signature.
An email has to → subject → body → signature. A case summary has
title → sections with headings → body paragraphs. The LLM knows
the anatomy of each document type — it doesn't need a template.

**The renderer is generic.** It knows how to render ~15 semantic roles
visually. It doesn't know anything about "court letters" vs "emails."
It just knows that "date" is right-aligned italic, "body" is justified
serif, "signature_name" is bold right-aligned. The LLM chooses which
roles to use; the renderer makes them look right.

**RTL/LTR is handled by layout hints.** When the LLM generates an
Arabic document, it sets `direction: "rtl"`. The renderer flips
alignments. Right-aligned date becomes left-aligned. Left-aligned
recipient becomes right-aligned. All from one flag.

**Any new document type works automatically.** The LLM just outputs
the right sections. A power of attorney? The LLM uses: title →
parties → body → witness_block → signature. The renderer has never
seen "power of attorney" but it knows how to render each role.

## The Section Schema

### What the LLM outputs (in the generateDraft tool)

```typescript
interface DraftSection {
  role: string; // Semantic role (see role catalog below)
  text: string; // The actual content
  label?: string; // Optional prefix label (e.g., "Objet:", "De:", "À:")
}

interface DraftLayout {
  direction: "ltr" | "rtl";
  language: string; // "fr" | "ar" | "en" | etc.
  formality: "formal" | "standard" | "casual";
  documentClass: string; // "court_letter" | "email" | "summary" | etc.
  // Used for subtle style variations, NOT for template selection
}

// Updated generateDraft tool content field:
interface GenerateDraftInput {
  draftType: string;
  title: string;
  subtitle?: string;
  metadata?: Record<string, string>;
  sections: DraftSection[]; // ← REPLACES the flat "content" string
  layout: DraftLayout;
  linkedEntityType?: string;
  linkedEntityId?: number;
}
```

### Role Catalog

These are all the roles the renderer needs to support. The LLM can
use any combination — the renderer handles whatever it receives.

```
HEADER ROLES:
  "date"              — Document date. Right-aligned (LTR) or left-aligned (RTL).
  "sender"            — Sender name/address block.
  "recipient"         — Recipient name/title/address block.
  "reference"         — Case number, file reference, reference line.
  "subject"           — Subject/object line. Usually has a label ("Objet:").

CONTENT ROLES:
  "salutation"        — Opening greeting ("Monsieur le Président,").
  "body"              — Body paragraph. The main content. Can repeat.
  "heading"           — Section heading within the document.
  "subheading"        — Sub-section heading.
  "list_item"         — Bulleted or numbered item.
  "quote"             — Quoted text or legal citation.
  "note"              — Footnote, annotation, or aside.
  "highlight"         — Emphasized paragraph (key conclusion, warning).

CLOSING ROLES:
  "closing"           — Formal closing formula.
  "signature_name"    — Signatory name.
  "signature_title"   — Signatory professional title.
  "signature_detail"  — Additional signature info (phone, bar number).
  "stamp_area"        — Placeholder for official stamp/seal.

STRUCTURAL ROLES:
  "separator"         — Visual divider line.
  "spacer"            — Vertical space.
  "page_break"        — Page break hint (for export, ignored in preview).
```

## The Renderer Component

```typescript
// DraftRenderer.tsx — the generic section renderer

interface DraftRendererProps {
  sections: DraftSection[];
  layout: DraftLayout;
}

function DraftRenderer({ sections, layout }: DraftRendererProps) {
  const isRTL = layout.direction === 'rtl';
  const fontFamily = getFontFamily(layout);

  return (
    <div style={{
      direction: layout.direction,
      fontFamily: fontFamily.body,
      // ... base styles
    }}>
      {sections.map((section, i) => (
        <SectionRenderer
          key={i}
          section={section}
          layout={layout}
          fontFamily={fontFamily}
        />
      ))}
    </div>
  );
}

function SectionRenderer({ section, layout, fontFamily }) {
  // Each role maps to a style configuration
  const styles = ROLE_STYLES[section.role] || ROLE_STYLES.body;
  const resolvedStyles = resolveDirection(styles, layout.direction);

  // Roles like "spacer" and "separator" have no text
  if (section.role === 'spacer') return <div style={{ height: 16 }} />;
  if (section.role === 'separator') return <hr style={separatorStyle} />;

  return (
    <div style={resolvedStyles}>
      {section.label && (
        <span style={labelStyle}>{section.label} </span>
      )}
      {section.text}
    </div>
  );
}

// Style definitions per role
const ROLE_STYLES = {
  date: {
    textAlign: 'end',          // 'end' respects RTL automatically
    fontStyle: 'italic',
    color: '#8b949e',
    fontSize: '12.5px',
    marginBottom: '20px',
  },
  sender: {
    fontWeight: 500,
    fontSize: '13px',
    lineHeight: 1.5,
    marginBottom: '16px',
  },
  recipient: {
    fontWeight: 500,
    fontSize: '13px',
    lineHeight: 1.5,
    marginBottom: '16px',
  },
  reference: {
    fontFamily: 'monospace',
    fontSize: '11.5px',
    color: '#8b949e',
    marginBottom: '8px',
  },
  subject: {
    fontWeight: 600,
    fontSize: '13px',
    color: '#e6edf3',
    marginBottom: '16px',
  },
  salutation: {
    fontSize: '13.5px',
    marginBottom: '16px',
  },
  body: {
    fontSize: '13.5px',
    lineHeight: 1.8,
    textAlign: 'justify',
    marginBottom: '12px',
  },
  heading: {
    fontWeight: 700,
    fontSize: '15px',
    color: '#e6edf3',
    marginTop: '24px',
    marginBottom: '8px',
  },
  subheading: {
    fontWeight: 600,
    fontSize: '13.5px',
    color: '#c9d1d9',
    marginTop: '16px',
    marginBottom: '6px',
  },
  list_item: {
    fontSize: '13.5px',
    lineHeight: 1.7,
    paddingInlineStart: '20px',  // Respects RTL
    marginBottom: '4px',
  },
  closing: {
    fontSize: '13.5px',
    lineHeight: 1.8,
    marginTop: '20px',
    marginBottom: '24px',
  },
  signature_name: {
    fontWeight: 600,
    fontStyle: 'italic',
    fontSize: '13.5px',
    textAlign: 'end',
  },
  signature_title: {
    fontSize: '12px',
    color: '#8b949e',
    textAlign: 'end',
  },
  signature_detail: {
    fontSize: '11.5px',
    fontFamily: 'monospace',
    color: '#6e7681',
    textAlign: 'end',
  },
  // ... other roles
};

// Font selection based on language and formality
function getFontFamily(layout: DraftLayout) {
  if (layout.language === 'ar') {
    return {
      body: "'Noto Naskh Arabic', 'Amiri', serif",
      mono: "'Noto Naskh Arabic', monospace",
    };
  }
  if (layout.formality === 'formal') {
    return {
      body: "'Crimson Pro', 'Georgia', serif",
      mono: "'DM Mono', monospace",
    };
  }
  return {
    body: "'DM Sans', system-ui, sans-serif",
    mono: "'DM Mono', monospace",
  };
}
```

## The Edit Experience

### The Problem with Editing HTML

If the document is rendered as HTML and the user clicks "Edit", they
see raw markup. That's unacceptable.

### The Solution: Section-Level Editing

The edit mode doesn't expose a single textarea with the whole document.
It renders each section as an EDITABLE FIELD — the user sees the same
visual layout but each section's text becomes a text input.

```
VIEW MODE:                          EDIT MODE:
┌──────────────────────────┐       ┌──────────────────────────┐
│      Tunis, le 18 mars   │       │  ┌─────────────────────┐ │
│                          │       │  │ Tunis, le 18 mars   │ │ ← editable input
│ À M. le Président du     │       │  └─────────────────────┘ │
│ Tribunal de Tunis        │       │  ┌─────────────────────┐ │
│                          │       │  │ À M. le Président   │ │ ← editable input
│ Objet: Demande de report │       │  │ du Tribunal de Tunis│ │
│                          │       │  └─────────────────────┘ │
│ Monsieur le Président,   │       │  ┌─────────────────────┐ │
│                          │       │  │ Objet: Demande de   │ │ ← editable input
│ Nous avons l'honneur     │       │  └─────────────────────┘ │
│ de vous adresser...      │       │  ┌─────────────────────┐ │
│                          │       │  │ Monsieur le Prési.. │ │ ← editable input
│                          │       │  └─────────────────────┘ │
│                          │       │  ┌─────────────────────┐ │
│ Me. Karim Jebali         │       │  │ Nous avons l'honneur│ │ ← editable textarea
│ Avocat au Barreau        │       │  │ de vous adresser la │ │    (auto-grows)
│                          │       │  │ présente requête... │ │
└──────────────────────────┘       │  └─────────────────────┘ │
                                    │  ...                     │
                                    └──────────────────────────┘

Each section becomes an editable field.
The LAYOUT stays the same. Only the text is editable.
The user never sees HTML, roles, or structure.
```

Implementation:

```typescript
function EditableSectionRenderer({ section, layout, onUpdate }) {
  if (section.role === 'spacer' || section.role === 'separator') {
    return <SectionRenderer section={section} layout={layout} />;
  }

  const styles = ROLE_STYLES[section.role] || ROLE_STYLES.body;
  const isMultiLine = section.role === 'body' || section.role === 'closing';

  if (isMultiLine) {
    return (
      <textarea
        value={section.text}
        onChange={e => onUpdate(section, e.target.value)}
        style={{
          ...styles,
          // textarea-specific overrides
          width: '100%',
          border: '1px solid #30363d',
          borderRadius: 4,
          background: 'rgba(13,17,23,0.5)',
          resize: 'none',
          padding: '8px 10px',
          // auto-grow handled by JS
        }}
      />
    );
  }

  return (
    <input
      type="text"
      value={section.text}
      onChange={e => onUpdate(section, e.target.value)}
      style={{
        ...styles,
        width: '100%',
        border: '1px solid #30363d',
        borderRadius: 4,
        background: 'rgba(13,17,23,0.5)',
        padding: '6px 10px',
      }}
    />
  );
}
```

The user edits text in each field. The section roles and layout are
preserved. When switching back to view mode, the updated sections
render through the normal renderer with the same visual styling.

## System Prompt Update

The LLM needs to output structured sections instead of flat text.
Update the draft instructions:

```
DRAFT OUTPUT FORMAT:

When calling generateDraft, structure the document as an array of sections.
Each section has a "role" and "text" (and optional "label").

Available roles:
  Header: date, sender, recipient, reference, subject
  Content: salutation, body, heading, subheading, list_item, quote, note
  Closing: closing, signature_name, signature_title, signature_detail
  Structure: spacer, separator

Also provide layout hints:
  direction: "ltr" or "rtl" (based on document language)
  language: the document's language code
  formality: "formal" for legal/court documents, "standard" for business
  documentClass: the type of document for subtle styling

Example for a French court letter:
{
  sections: [
    { role: "date", text: "Tunis, le 18 mars 2026" },
    { role: "recipient", text: "M. le Président du Tribunal de Première Instance de Tunis" },
    { role: "reference", text: "Affaire n° 2025/COM/1847" },
    { role: "subject", label: "Objet :", text: "Demande de report d'audience" },
    { role: "spacer" },
    { role: "salutation", text: "Monsieur le Président," },
    { role: "spacer" },
    { role: "body", text: "Nous avons l'honneur..." },
    { role: "body", text: "En raison de..." },
    { role: "spacer" },
    { role: "closing", text: "Veuillez agréer..." },
    { role: "spacer" },
    { role: "signature_name", text: "Me. Karim Jebali" },
    { role: "signature_title", text: "Avocat au Barreau de Tunis" },
    { role: "signature_detail", text: "Tél : +216 XX XXX XXX" }
  ],
  layout: { direction: "ltr", language: "fr", formality: "formal", documentClass: "court_letter" }
}

Example for an Arabic court request:
{
  sections: [
    { role: "heading", text: "بسم الله الرحمن الرحيم" },
    { role: "recipient", text: "السيد رئيس المحكمة الابتدائية بتونس" },
    { role: "reference", label: "الملف عدد:", text: "2025/1847" },
    { role: "subject", label: "الموضوع:", text: "طلب تأجيل الجلسة" },
    ...
  ],
  layout: { direction: "rtl", language: "ar", formality: "formal", documentClass: "court_request" }
}

The renderer handles all visual formatting. You just provide the
semantic structure and content. Different document types use different
combinations of roles — the renderer adapts automatically.
```

## Migration from Current Implementation

Currently generateDraft has a flat `content: string` field.
Change to `sections: DraftSection[]` + `layout: DraftLayout`.

The tool input schema changes from:

```
content: { type: "string", description: "The full draft text" }
```

To:

```
sections: {
  type: "array",
  items: {
    type: "object",
    properties: {
      role: { type: "string" },
      text: { type: "string" },
      label: { type: "string" }
    },
    required: ["role"]
  }
},
layout: {
  type: "object",
  properties: {
    direction: { type: "string", enum: ["ltr", "rtl"] },
    language: { type: "string" },
    formality: { type: "string", enum: ["formal", "standard", "casual"] },
    documentClass: { type: "string" }
  }
}
```

## Implementation Tasks

```
Backend:
  1. Update generateDraft tool schema (sections + layout instead of content)
  2. Update system prompt with section format instructions + examples
  3. Update draft_artifact SSE event to carry sections + layout

Frontend:
  4. Create DraftRenderer component (generic section renderer)
  5. Create role style map (ROLE_STYLES) with all ~18 roles
  6. Add RTL support (direction-aware alignment)
  7. Add font selection by language (Arabic fonts, French serif, etc.)
  8. Update DraftArtifactCard to use DraftRenderer instead of plain text
  9. Create EditableDraftRenderer (section-level editing)
  10. Wire edit mode: view ↔ edit toggle uses same sections with editable fields
  11. Wire regenerate: send updated sections back to agent for regen

Testing:
  12. Test French formal letter (LTR, serif, right-aligned date)
  13. Test Arabic court request (RTL, Arabic font, flipped layout)
  14. Test English case summary (LTR, headings + body paragraphs)
  15. Test edit flow: edit sections → switch to view → verify changes persist
  16. Test regenerate: modify instructions → verify new sections generated
```

## Tradeoffs and Risks

| Risk                                      | Mitigation                                                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| LLM outputs malformed sections            | Validate section array on receipt. Fall back to single body section with raw text if malformed.            |
| LLM uses wrong roles                      | Renderer has a fallback: unknown roles render as "body" style.                                             |
| Section format increases token usage      | ~20% more tokens than flat text. Acceptable for structured output.                                         |
| Arabic font availability                  | Bundle Noto Naskh Arabic or Amiri. Don't rely on system fonts.                                             |
| Edit loses structure                      | Each field maps to one section. Structure is preserved by design.                                          |
| LLM outputs flat text instead of sections | Same enforcement as before: re-prompt once, then fall back to wrapping flat text in a single body section. |
