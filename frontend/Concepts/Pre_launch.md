# 🚀 PRE_LAUNCH_ROADMAP.md  
**Ordinay — Pre-Launch Work Tracker**

This document tracks the **remaining critical work** required before launching Ordinay publicly.  
The focus is on **usability, trust, data safety, and product readiness** — not feature bloat.

---

## 1️⃣ Financial Section Review & Simplification (HIGH PRIORITY)

### Problem
The financial section is currently **confusing and cognitively heavy**:
- Too many concepts shown at once
- Mixed terminology (expenses, fees, payments, balances)
- Hard for users to quickly understand:
  - What they earned
  - What is paid / unpaid
  - What is pending

### Objectives
- Clarify the **financial mental model**
- Reduce friction for daily use
- Ensure legal & accounting clarity

### Tasks
- [ ] Audit all financial screens (lists, detail views, modals)
- [ ] Simplify labels and grouping (Expenses / Income / Payments)
- [ ] Ensure all balances are clearly explained (tooltips + i18n)
- [ ] Remove unnecessary blockers or misleading warnings
- [ ] Validate totals after edits and deletions
- [ ] Align UI with real-world legal accounting workflows

### Acceptance Criteria
- A non-technical lawyer understands their financial situation in < 1 minute
- No contradictory numbers
- All actions feel safe, reversible, and traceable

---

## 2️⃣ Export & Import (Data Ownership Feature) (HIGH VALUE)

### Why This Matters
Export/import is a **trust signal** and a **download incentive**:
> “My data is mine.”

Especially important for a **desktop-first app**.

### Scope
Entities to support:
- Clients
- Dossiers
- Tasks
- Missions
- Hearings
- Financial entries  
- (Later: documents metadata)

### Tasks
- [ ] Add **Export** (CSV + JSON minimum)
- [ ] Add **Import** with validation and preview
- [ ] Handle duplicates safely (merge / skip / replace)
- [ ] Ensure UTF-8 encoding works for FR / AR
- [ ] Provide clear UX feedback (success / partial / errors)

### Acceptance Criteria
- Users can fully back up their data
- Users can migrate data between machines
- No silent failures

---

## 3️⃣ Interactive Tutorial / Onboarding (ESSENTIAL)

### Problem
Ordinay is powerful but **dense**. Without guidance:
- Users feel lost
- Value is not immediately clear

### Objective
Teach **how to work**, not explain every button.

### Tasks
- [ ] Design onboarding flow (first launch only)
- [ ] Step-by-step contextual tips:
  - Dashboard
  - Clients → Dossiers → Tasks workflow
  - Missions & hearings
  - Financial basics
- [ ] Allow replaying the tutorial later
- [ ] Use short, human language (not documentation tone)

### Acceptance Criteria
- A new user understands the workflow in < 10 minutes
- No external documentation needed to get started

---

## 4️⃣ Payment & Subscription Traceability (CRITICAL FOR BUSINESS)

### Context
Even as a desktop app, Ordinay will support:
- Monthly plans
- Yearly plans
- One-time lifetime purchase

Users must trust:
- What they paid
- When
- For what

### Tasks
- [ ] Define a local **license / subscription model**
- [ ] Store payment history locally (encrypted if needed)
- [ ] Track:
  - Plan type
  - Start / end dates
  - Renewal status
- [ ] Display subscription status clearly in settings (with read-only behavior explained)
- [ ] Prepare for future online verification (without enforcing it now)

### Acceptance Criteria
- Users can always see:
  - Their plan
  - Expiration date
  - Payment history
- No dark patterns
- No hidden lockouts

---

## 5️⃣ Archive Feature (Smart, Non-Destructive) (HIGH IMPACT)

### Objective
Allow users to **declutter without losing data**.

Archived entities should:
- Not affect active workflows
- Not pollute stats
- Remain searchable and viewable

### Scope
Entities:
- Clients
- Dossiers
- Tasks
- Missions
- Hearings

### Tasks
- [ ] Add `archived_at` logic (no hard deletion)
- [ ] Exclude archived items from:
  - Dashboard stats
  - Active lists
- [ ] Add “Archived” views with filters
- [ ] Intelligent display:
  - Clearly marked as archived
  - Read-only by default
- [ ] Allow restore from archive

### Acceptance Criteria
- Archiving feels safe and reversible
- Active workspace stays clean
- Historical data remains accessible

---

## 🧠 Final Pre-Launch Checklist

Before launch:
- [ ] Financial section feels **simple and trustworthy**
- [ ] Users can **export/import their data**
- [ ] App teaches itself via onboarding
- [ ] Payments & plans are transparent
- [ ] Archive system prevents clutter without data loss

---

## 📌 Guiding Principle

> **Before launch, every feature must answer one question:**  
> *“Does this reduce user anxiety or increase trust?”*

If not — it doesn’t ship.
