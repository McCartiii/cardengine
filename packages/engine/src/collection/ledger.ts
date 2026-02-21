import type { VariantId } from "../identity/types.js";

export type Condition =
  | "mint"
  | "near_mint"
  | "lightly_played"
  | "moderately_played"
  | "heavily_played"
  | "damaged";

export type LanguageCode = string & { readonly __brand: "LanguageCode" };

export interface CardLocation {
  kind: "binder" | "box" | "deck" | "other";
  name: string;
}

export type LedgerEventType =
  | "add"
  | "remove"
  | "move"
  | "set_condition"
  | "set_language"
  | "set_note";

export interface LedgerEventBase {
  id: string;
  at: string;
  type: LedgerEventType;
  variantId: VariantId;
}

export interface AddEvent extends LedgerEventBase {
  type: "add";
  quantity: number;
  condition?: Condition;
  language?: LanguageCode;
  isFoil?: boolean;
  location?: CardLocation;
}

export interface RemoveEvent extends LedgerEventBase {
  type: "remove";
  quantity: number;
  location?: CardLocation;
}

export interface MoveEvent extends LedgerEventBase {
  type: "move";
  quantity: number;
  from?: CardLocation;
  to?: CardLocation;
}

export interface SetConditionEvent extends LedgerEventBase {
  type: "set_condition";
  condition: Condition;
}

export interface SetLanguageEvent extends LedgerEventBase {
  type: "set_language";
  language: LanguageCode;
}

export interface SetNoteEvent extends LedgerEventBase {
  type: "set_note";
  note: string;
}

export type LedgerEvent =
  | AddEvent
  | RemoveEvent
  | MoveEvent
  | SetConditionEvent
  | SetLanguageEvent
  | SetNoteEvent;

export interface VariantHoldings {
  variantId: VariantId;
  totalQuantity: number;
  byLocation: Array<{ location: CardLocation; quantity: number }>;
  lastCondition?: Condition;
  lastLanguage?: LanguageCode;
  lastNote?: string;
}

export function materializeHoldings(
  events: LedgerEvent[]
): Map<VariantId, VariantHoldings> {
  const holdings = new Map<VariantId, VariantHoldings>();

  const get = (variantId: VariantId): VariantHoldings => {
    const existing = holdings.get(variantId);
    if (existing) return existing;
    const next: VariantHoldings = {
      variantId,
      totalQuantity: 0,
      byLocation: [],
    };
    holdings.set(variantId, next);
    return next;
  };

  const addToLocation = (
    h: VariantHoldings,
    location: CardLocation | undefined,
    delta: number
  ) => {
    if (!location) return;
    const idx = h.byLocation.findIndex(
      (x) =>
        x.location.kind === location.kind && x.location.name === location.name
    );
    if (idx === -1) {
      h.byLocation.push({ location, quantity: delta });
    } else {
      h.byLocation[idx] = {
        location,
        quantity: h.byLocation[idx].quantity + delta,
      };
    }
    h.byLocation = h.byLocation.filter((x) => x.quantity !== 0);
  };

  for (const e of events) {
    const h = get(e.variantId);
    switch (e.type) {
      case "add":
        h.totalQuantity += e.quantity;
        addToLocation(h, e.location, e.quantity);
        if (e.condition) h.lastCondition = e.condition;
        if (e.language) h.lastLanguage = e.language;
        break;
      case "remove":
        h.totalQuantity -= e.quantity;
        addToLocation(h, e.location, -e.quantity);
        break;
      case "move":
        addToLocation(h, e.from, -e.quantity);
        addToLocation(h, e.to, e.quantity);
        break;
      case "set_condition":
        h.lastCondition = e.condition;
        break;
      case "set_language":
        h.lastLanguage = e.language;
        break;
      case "set_note":
        h.lastNote = e.note;
        break;
    }
  }

  return holdings;
}
