import { TurnType, type AgentTurnInput } from "../types";
import type { Session } from "../session";

const AFFIRMATIVE_KEYWORDS = [
  "yes",
  "y",
  "ok",
  "okay",
  "sure",
  "confirm",
  "approve",
  "approved",
  "go ahead",
  "proceed",
  "do it",
  "oui",
  "d accord",
  "daccord",
  "confirme",
  "valide",
  "vas y",
  "allez y",
  "cest bon",
  "parfait",
  "نعم",
  "اي",
  "ايوه",
  "موافق",
  "تمام",
  "نفذ",
  "اكد",
  "أكيد",
] as const;

const REJECTION_KEYWORDS = [
  "no",
  "nope",
  "cancel",
  "stop",
  "dont",
  "do not",
  "not now",
  "non",
  "annule",
  "annuler",
  "arrete",
  "pas maintenant",
  "laisse tomber",
  "refuse",
  "لا",
  "الغي",
  "إلغاء",
  "لا تنفذ",
  "مش موافق",
  "ارفض",
] as const;

const AMENDMENT_KEYWORDS = [
  "change",
  "modify",
  "update",
  "instead",
  "make it",
  "edit",
  "correct",
  "adjust",
  "amend",
  "replace",
  "change it",
  "modifie",
  "modifier",
  "change",
  "au lieu",
  "plutot",
  "corrige",
  "corriger",
  "mets",
  "غير",
  "عدل",
  "بدل",
  "صحح",
  "خليه",
  "خليها",
  "بدلها",
] as const;

export class TurnClassifier {
  classify(input: AgentTurnInput, session: Session): TurnType {
    if (!session.state.pendingAction) {
      return TurnType.NEW;
    }

    const normalized = normalizeText(input.message);
    if (!normalized) {
      return TurnType.NEW;
    }

    if (matchesKeywords(normalized, AFFIRMATIVE_KEYWORDS)) {
      return TurnType.CONFIRMATION;
    }

    if (matchesKeywords(normalized, REJECTION_KEYWORDS)) {
      return TurnType.REJECTION;
    }

    if (matchesKeywords(normalized, AMENDMENT_KEYWORDS)) {
      return TurnType.AMENDMENT;
    }

    return TurnType.NEW;
  }
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesKeywords(
  normalizedInput: string,
  keywords: readonly string[],
): boolean {
  if (!normalizedInput) {
    return false;
  }

  const tokens = new Set(normalizedInput.split(" ").filter(Boolean));
  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword);
    if (!normalizedKeyword) {
      continue;
    }

    if (normalizedKeyword.includes(" ")) {
      if (normalizedInput.includes(normalizedKeyword)) {
        return true;
      }
      continue;
    }

    if (tokens.has(normalizedKeyword)) {
      return true;
    }
  }

  return false;
}
