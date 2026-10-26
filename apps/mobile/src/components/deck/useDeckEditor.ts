// Hand edits to a deck: each change shows at once, then saves in the
// background (a burst of taps saves once). The last change can be undone.
import { useCallback, useEffect, useRef, useState } from "react";
import { getDeck, updateDeck, updateDeckCards, type DeckCard } from "@/lib/api";
import { commandersOf, toEntries } from "@/lib/deckEdits";

type LoadedDeck = Awaited<ReturnType<typeof getDeck>>;

const SAVE_DELAY_MS = 700;

export type SaveState = "idle" | "saving" | "error";

export interface UndoInfo {
  label: string;
  cards: DeckCard[];
}

export function useDeckEditor(id: string, deck: LoadedDeck | null, setDeck: (d: LoadedDeck) => void) {
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [undo, setUndo] = useState<UndoInfo | null>(null);
  const latest = useRef(deck);
  const edits = useRef(0);
  const commandersTouched = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  latest.current = deck;

  const save = useCallback(async () => {
    timer.current = null;
    const d = latest.current;
    if (!d) return;
    const n = edits.current;
    setSaveState("saving");
    try {
      await updateDeckCards(id, toEntries(d.deck.cards));
      // The deck's commander follows the command zone once it's been edited by hand.
      if (commandersTouched.current) {
        const [commander = null, partner = null] = commandersOf(d.deck.cards);
        await updateDeck(id, { commander, partner });
        commandersTouched.current = false;
      }
      if (n !== edits.current) return; // newer edits will save again
      const fresh = await getDeck(id);
      if (n !== edits.current) return;
      setDeck(fresh);
      setSaveState("idle");
    } catch {
      if (n === edits.current) setSaveState("error");
    }
  }, [id, setDeck]);

  // Save right away if the screen closes with edits waiting.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        save();
      }
    },
    [save]
  );

  /** Applies a change to the card list. A label makes it undoable ("Removed Sol Ring"). */
  const edit = useCallback(
    (change: (cards: DeckCard[]) => DeckCard[], label?: string) => {
      const d = latest.current;
      if (!d) return;
      const before = d.deck.cards;
      const after = change(before);
      if (after === before) return;
      if (commandersOf(before).join("|") !== commandersOf(after).join("|")) commandersTouched.current = true;
      const next = { ...d, deck: { ...d.deck, cards: after } };
      latest.current = next;
      setDeck(next);
      setUndo(label ? { label, cards: before } : null);
      edits.current++;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(save, SAVE_DELAY_MS);
    },
    [save, setDeck]
  );

  const undoLast = useCallback(() => {
    if (!undo) return;
    const cards = undo.cards;
    edit(() => cards);
    setUndo(null);
  }, [edit, undo]);

  const retry = useCallback(() => {
    edits.current++;
    save();
  }, [save]);

  return { edit, undo, undoLast, dismissUndo: () => setUndo(null), saveState, retry };
}

/** A card added on the phone, shaped like the server's until the save comes back. */
export function localDeckCard(
  p: { name: string; variantId?: string | null; imageUri?: string | null; typeLine?: string | null; manaCost?: string | null; rarity?: string | null; cmc?: number | null; price?: number | null },
  section: string,
  quantity = 1
): DeckCard {
  return {
    id: `local:${section}:${p.name}`,
    cardName: p.name,
    variantId: p.variantId ?? null,
    quantity,
    section,
    price: p.price ?? null,
    variant: {
      name: p.name,
      imageUri: p.imageUri ?? null,
      manaCost: p.manaCost ?? null,
      typeLine: p.typeLine ?? null,
      rarity: p.rarity ?? null,
      cmc: p.cmc ?? null,
    },
  };
}
