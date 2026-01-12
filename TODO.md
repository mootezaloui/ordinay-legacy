# docs/phase1/TODO.md

> Phase-1 extensibility audit execution spine  
> This file is the authoritative execution ledger.  
> Every task must be updated **only by the agent performing it**.  
> No task may be skipped, merged, or reordered without written justification.

---

## META

| Field | Value |
|------|------|
| Phase | 1 |
| Goal | Prepare Organia for profession extensibility |
| Scope | Documentation + design only (NO code refactors) |
| Authority | Audit Spec v1 |
| Status | 🟡 In Progress |

---

# EXECUTION PROTOCOL

For **every task update**:

• Mark status  
• Fill completion proof  
• Add commit hash (if any)  
• Add blocker notes if incomplete  
• Never delete previous logs — append only  

---

# FOUNDATION AUDIT

## TASK 1 — Audit all domain rules

| Status | ✅ Done |
| Owner | Codex |
| Output | docs/phase1/rule-categorization.md |
| Proof | 2026-01-12 chat audit of lawyer-app/src/services/domainRules.js |
| Commit | N/A |
| Notes | Output delivered in chat; file not yet persisted |

---

## TASK 2 — Map entity relationship assumptions

| Status | ✅ Done |
| Owner | Codex |
| Output | docs/phase1/entity-relationships.md |
| Proof | 2026-01-12 chat structural audit (schema + backend + domain rules) |
| Commit | N/A |
| Notes | Output delivered in chat; file not yet persisted |

---

## TASK 10 — Document database schema assumptions

| Status | ⬜ |
| Owner |  |
| Output | docs/phase1/schema-assumptions.md |
| Proof |  |
| Commit |  |
| Notes |  |

---

# DEEP DIVE

## TASK 4 — Document implicit entity semantics

| Status | ⬜ |
| Owner |  |
| Output | docs/phase1/entity-semantics.md |
| Proof |  |
| Commit |  |
| Notes |  |

---

## TASK 7 — Map status lifecycles

| Status | ⬜ |
| Owner |  |
| Output | docs/phase1/status-lifecycles.md |
| Proof |  |
| Commit |  |
| Notes |  |

---

## TASK 5 — Audit financial rules

| Status | ⬜ |
| Owner |  |
| Output | docs/phase1/financial-rules.md |
| Proof |  |
| Commit |  |
| Notes |  |

---

## TASK 6 — Audit notification rules

| Status | ⬜ |
| Owner |  |
| Output | docs/phase1/notification-rules.md |
| Proof |  |
| Commit |  |
| Notes |  |

---

# COVERAGE & GAPS

## TASK 3 — Validation pipeline audit

| Status | ✅ Done |
| Owner | Codex |
| Output | docs/phase1/validation-coverage.md |
| Proof | 2026-01-12 chat mutation/validation audit (backend + frontend + domainRules) |
| Commit | N/A |
| Notes | Output delivered in chat; file not yet persisted |

---

## TASK 8 — History trail completeness audit

| Status | ✅ Done |
| Owner | Codex |
| Output | docs/phase1/history-audit.md |
| Proof | 2026-01-12 chat mutation/validation audit (history coverage) |
| Commit | N/A |
| Notes | Output delivered in chat; file not yet persisted |

---

## TASK 9 — UI / Domain coupling audit

| Status | ⬜ |
| Owner |  |
| Output | docs/phase1/ui-coupling-audit.md |
| Proof |  |
| Commit |  |
| Notes |  |

---

## TASK 19 — Missing validation audit

| Status | ⬜ |
| Owner |  |
| Output | docs/phase1/validation-gaps.md |
| Proof |  |
| Commit |  |
| Notes |  |

---

# DESIGN PHASE

## TASK 11 — Profession plugin interface

| Status | ⬜ |
| Owner |  |
| Output | docs/phase1/profession-plugin-interface.md |
| Proof |  |
| Commit |  |
| Notes |  |

---

## TASK 12 — Rule orchestration design

| Status | ⬜ |
| Owner |  |
| Output | docs/phase1/rule-orchestration-design.md |
| Proof |  |
| Commit |  |
| Notes |  |

---

## TASK 13 — Entity abstraction layer design

| Status | ⬜ |
| Owner |  |
| Output | docs/phase1/entity-abstraction-design.md |
| Proof |  |
| Commit |  |
| Notes |  |

---

## TASK 15 — Profession config system design

| Status | ⬜ |
| Owner |  |
| Output | docs/phase1/profession-config-schema.md |
| Proof |  |
| Commit |  |
| Notes |  |

---

## TASK 14 — Agent validation protocol design

| Status | ⬜ |
| Owner |  |
| Output | docs/phase1/agent-validation-protocol.md |
| Proof |  |
| Commit |  |
| Notes |  |

---

# RISK & VALIDATION

## TASK 16 — Abstraction risk analysis

| Status | ⬜ |
| Owner |  |
| Output | docs/phase1/abstraction-risks.md |
| Proof |  |
| Commit |  |
| Notes |  |

---

## TASK 17 — Validation test suite

| Status | ⬜ |
| Owner |  |
| Output | tests/domain/domainRules.test.js |
| Proof |  |
| Commit |  |
| Notes |  |

---

## TASK 18 — Backward compatibility constraints

| Status | ⬜ |
| Owner |  |
| Output | docs/phase1/backward-compat-requirements.md |
| Proof |  |
| Commit |  |
| Notes |  |

---

## TASK 20 — Layer coupling analysis

| Status | ⬜ |
| Owner |  |
| Output | docs/phase1/layer-coupling-analysis.md |
| Proof |  |
| Commit |  |
| Notes |  |

---

# EXECUTION LEDGER

| Date | Task | Agent | Action | Commit | Notes |
|-----|-----|-----|------|------|------|
|     |     |     |      |      |      |
| 2026-01-12 | TASK 1 - Audit all domain rules | Codex | Read-only audit of lawyer-app/src/services/domainRules.js | N/A | Proof: chat report |
| 2026-01-12 | TASK 2 - Map entity relationship assumptions | Codex | Read-only structural audit (schema + backend services/controllers + domainRules) | N/A | Proof: chat report |
| 2026-01-12 | TASK 3 — Validation pipeline audit | Codex | Read-only mutation/validation audit (backend + frontend + domainRules) | N/A | Proof: chat report |
| 2026-01-12 | TASK 8 — History trail completeness audit | Codex | Read-only mutation/history audit | N/A | Proof: chat report |

---

# RULES

• No task can move to Phase-2 unless **all Phase-1 tasks are DONE**  
• Any missing proof = task considered FAILED  
• Any undocumented mutation = violation  
• This file is immutable history — append only  

---

END OF PHASE-1 EXECUTION SPINE
