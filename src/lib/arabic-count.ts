/**
 * A counted noun in Arabic: 1 قطعة, 2 قطعتان, 3-10 قطع, 11 and over قطعة (with the number).
 */
export function arCount(n: number, forms: { one: string; two: string; few: string; many: string }) {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  if (n >= 3 && n <= 10) return `${n} ${forms.few}`;
  return `${n} ${forms.many}`;
}
