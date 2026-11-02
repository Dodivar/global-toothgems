/**
 * Text folded for searching and comparing: accents removed (NFD, combining
 * marks stripped) and lower-cased, so "Éclat" matches "eclat".
 */
export function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}
