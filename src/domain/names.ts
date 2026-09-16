const forbidden = /[<>:"/\\|?*]/;
function isUnsafe(character: string) {
  return (
    forbidden.test(character) || character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
  );
}
const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export function normalizedName(name: string): string {
  return name
    .trim()
    .normalize('NFC')
    .replace(/\.png$/i, '')
    .trim();
}
export function nameError(name: string): string | null {
  const base = normalizedName(name);
  if (!base) return 'Enter a name.';
  if (
    base === '.' ||
    base === '..' ||
    [...base].some(isUnsafe) ||
    /[. ]$/.test(base) ||
    reserved.test(base)
  )
    return 'Use a valid name, without / \\ : * ? " < > |.';
  if (new TextEncoder().encode(base).length > 180) return 'Name is too long.';
  return null;
}
export function validateNames(names: string[]): (string | null)[] {
  const counts = new Map<string, number>();
  for (const name of names) {
    const key = normalizedName(name).toLocaleLowerCase('en');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return names.map(
    (name) =>
      nameError(name) ??
      ((counts.get(normalizedName(name).toLocaleLowerCase('en')) ?? 0) > 1
        ? 'This name is duplicated.'
        : null),
  );
}
export function safeStem(filename: string): string {
  const stem = [...filename.replace(/\.png$/i, '').normalize('NFC')]
    .map((character) => (isUnsafe(character) ? '_' : character))
    .join('')
    .replace(/[. ]+$/g, '')
    .slice(0, 60);
  return !stem || reserved.test(stem) ? 'image' : stem;
}
