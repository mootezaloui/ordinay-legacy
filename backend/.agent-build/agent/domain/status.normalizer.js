"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeStatus = normalizeStatus;
exports.isClosedLike = isClosedLike;
exports.isInactiveLike = isInactiveLike;
exports.isTaskTerminal = isTaskTerminal;
exports.isSessionTerminal = isSessionTerminal;
exports.isMissionTerminal = isMissionTerminal;
exports.isFinancialCancelled = isFinancialCancelled;
exports.isFinancialPaid = isFinancialPaid;
exports.canonicalizeTargetStatus = canonicalizeTargetStatus;
exports.isReceivableEntry = isReceivableEntry;
function normalizeStatus(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
}
function isClosedLike(value) {
    const normalized = normalizeStatus(value);
    return (normalized === "closed" ||
        normalized === "archive" ||
        normalized === "archived" ||
        normalized === "completed" ||
        normalized === "done" ||
        normalized === "cloture" ||
        normalized === "clôturé" ||
        normalized === "cloturé" ||
        normalized === "ferme");
}
function isInactiveLike(value) {
    const normalized = normalizeStatus(value);
    return (normalized === "inactive" ||
        normalized === "in_active" ||
        normalized === "former_client" ||
        normalized === "disabled" ||
        normalized === "suspended");
}
function isTaskTerminal(value) {
    const normalized = normalizeStatus(value);
    return normalized === "done" || normalized === "completed" || normalized === "cancelled";
}
function isSessionTerminal(value) {
    const normalized = normalizeStatus(value);
    return normalized === "completed" || normalized === "cancelled";
}
function isMissionTerminal(value) {
    const normalized = normalizeStatus(value);
    return normalized === "completed" || normalized === "cancelled" || normalized === "closed";
}
function isFinancialCancelled(value) {
    const normalized = normalizeStatus(value);
    return normalized === "cancelled" || normalized === "void";
}
function isFinancialPaid(entry) {
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
function canonicalizeTargetStatus(entityType, value) {
    const normalized = normalizeStatus(value);
    if (!normalized)
        return null;
    const type = String(entityType || "").trim().toLowerCase();
    if (type === "client") {
        if (isInactiveLike(normalized))
            return "inactive";
        if (normalized === "active")
            return "active";
        return normalized;
    }
    if (type === "dossier" || type === "lawsuit") {
        if (isClosedLike(normalized))
            return "closed";
        if (normalized === "open" || normalized === "active" || normalized === "in_progress") {
            return "open";
        }
        return normalized;
    }
    if (type === "task") {
        if (isTaskTerminal(normalized))
            return "done";
        return normalized;
    }
    if (type === "session") {
        if (isSessionTerminal(normalized))
            return "completed";
        return normalized;
    }
    if (type === "mission") {
        if (isMissionTerminal(normalized))
            return "completed";
        return normalized;
    }
    if (type === "financial_entry") {
        if (normalized === "paid")
            return "confirmed";
        return normalized;
    }
    if (type === "officer") {
        if (isInactiveLike(normalized))
            return "inactive";
        if (normalized === "active")
            return "active";
        return normalized;
    }
    return normalized;
}
function isReceivableEntry(entry) {
    const direction = normalizeStatus(entry.direction);
    if (direction) {
        return direction === "receivable";
    }
    const scope = normalizeStatus(entry.scope);
    return scope !== "internal";
}
