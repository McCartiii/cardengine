/** Case-, accent- and apostrophe-insensitive key for a card name. */
export const normalizeCardName = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘]/g, "'")
    .trim()
    .toLowerCase();
