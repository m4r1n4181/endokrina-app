/** Display and store person names with a capital initial for each name part. */
export function normalizePersonName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('sr-Latn-RS')
    .replace(/(^|[\s'’\-])([\p{L}])/gu, (_match, separator: string, letter: string) =>
      `${separator}${letter.toLocaleUpperCase('sr-Latn-RS')}`,
    );
}
