export function normalizeStatus(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function isClosedLike(value: unknown): boolean {
  const normalized = normalizeStatus(value);
  return (
    normalized === "closed" ||
    normalized === "archive" ||
    normalized === "archived" ||
    normalized === "completed" ||
    normalized === "done" ||
    normalized === "cloture" ||
    normalized === "clôturé" ||
    normalized === "cloturé" ||
    normalized === "ferme"
  );
}

export function isInactiveLike(value: unknown): boolean {
  const normalized = normalizeStatus(value);
  return (
    normalized === "inactive" ||
    normalized === "in_active" ||
    normalized === "former_client" ||
    normalized === "disabled" ||
    normalized === "suspended"
  );
}

export function isTaskTerminal(value: unknown): boolean {
  const normalized = normalizeStatus(value);
  return normalized === "done" || normalized === "completed" || normalized === "cancelled";
}

export function isSessionTerminal(value: unknown): boolean {
  const normalized = normalizeStatus(value);
  return normalized === "completed" || normalized === "cancelled";
}

export function isMissionTerminal(value: unknown): boolean {
  const normalized = normalizeStatus(value);
  return normalized === "completed" || normalized === "cancelled" || normalized === "closed";
}

export function isFinancialCancelled(value: unknown): boolean {
  const normalized = normalizeStatus(value);
  return normalized === "cancelled" || normalized === "void";
}

export function isFinancialPaid(entry: Record<string, unknown>): boolean {
  const status = normalizeStatus(entry.status);
  if (status === "paid" || status === "confirmed") {
    return true;
  }
  if (entry.paid_at != null || entry.paidAt != null) {
    return true;
  }
  if (entry.isPaid === true) {
    return true;
  }
  return false;
}

export function canonicalizeTargetStatus(
  entityType: string,
  value: unknown,
): string | null {
  const normalized = normalizeStatus(value);
  if (!normalized) return null;

  const type = String(entityType || "").trim().toLowerCase();
  if (type === "client") {
    if (isInactiveLike(normalized)) return "inactive";
    if (normalized === "active") return "active";
    return normalized;
  }
  if (type === "dossier" || type === "lawsuit") {
    if (isClosedLike(normalized)) return "closed";
    if (normalized === "open" || normalized === "active" || normalized === "in_progress") {
      return "open";
    }
    return normalized;
  }
  if (type === "task") {
    if (isTaskTerminal(normalized)) return "done";
    return normalized;
  }
  if (type === "session") {
    if (isSessionTerminal(normalized)) return "completed";
    return normalized;
  }
  if (type === "mission") {
    if (isMissionTerminal(normalized)) return "completed";
    return normalized;
  }
  if (type === "financial_entry") {
    if (normalized === "paid") return "confirmed";
    return normalized;
  }
  if (type === "officer") {
    if (isInactiveLike(normalized)) return "inactive";
    if (normalized === "active") return "active";
    return normalized;
  }

  return normalized;
}

export function isReceivableEntry(entry: Record<string, unknown>): boolean {
  const direction = normalizeStatus(entry.direction);
  if (direction) {
    return direction === "receivable";
  }
  const scope = normalizeStatus(entry.scope);
  return scope !== "internal";
}
