import type { CardRecord } from "./types.js";

export type QueryOp = "and" | "or" | "not";
export type TextField =
  | "name"
  | "oracle_text"
  | "type_line"
  | "set"
  | "collector_number";

export interface TextTerm {
  kind: "text";
  field: TextField | "any";
  value: string;
}

export interface FacetTerm {
  kind: "facet";
  key: string;
  value: string | number | boolean;
}

export interface GroupTerm {
  kind: "group";
  op: QueryOp;
  terms: QueryTerm[];
}

export type QueryTerm = TextTerm | FacetTerm | GroupTerm;

export interface EngineQuery {
  root: QueryTerm;
}

export function matchesQuery(card: CardRecord, term: QueryTerm): boolean {
  switch (term.kind) {
    case "text":
      return matchesTextTerm(card, term);
    case "facet":
      return matchesFacetTerm(card, term);
    case "group":
      return matchesGroupTerm(card, term);
  }
}

function matchesTextTerm(card: CardRecord, term: TextTerm): boolean {
  const needle = term.value.toLowerCase();
  if (term.field === "any") {
    const haystack = [
      card.name,
      card.oracleText ?? "",
      card.typeLine ?? "",
      card.setId,
      card.collectorNumber,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  }
  const fieldMap: Record<string, string | undefined> = {
    name: card.name,
    oracle_text: card.oracleText,
    type_line: card.typeLine,
    set: card.setId,
    collector_number: card.collectorNumber,
  };
  const value = fieldMap[term.field];
  if (value == null) return false;
  return value.toLowerCase().includes(needle);
}

function matchesFacetTerm(card: CardRecord, term: FacetTerm): boolean {
  const record = card as unknown as Record<string, unknown>;
  const value = record[term.key];
  if (value == null) return false;
  if (Array.isArray(value)) {
    return value.includes(term.value);
  }
  if (typeof term.value === "number" && typeof value === "number") {
    return value === term.value;
  }
  if (typeof term.value === "boolean") {
    return value === term.value;
  }
  return String(value).toLowerCase() === String(term.value).toLowerCase();
}

function matchesGroupTerm(card: CardRecord, term: GroupTerm): boolean {
  switch (term.op) {
    case "and":
      return term.terms.every((t) => matchesQuery(card, t));
    case "or":
      return term.terms.some((t) => matchesQuery(card, t));
    case "not":
      return term.terms.length > 0 ? !matchesQuery(card, term.terms[0]) : true;
  }
}

export function filterCards(cards: CardRecord[], term: QueryTerm): CardRecord[] {
  return cards.filter((c) => matchesQuery(c, term));
}
