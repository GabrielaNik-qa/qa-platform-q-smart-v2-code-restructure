/** Groups link rows (owner → ids), e.g. team → its skills. */
export function grouped(rows: { owner: string | null; id: string }[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const { owner, id } of rows) {
    if (!owner) continue;
    const list = map.get(owner);
    if (list) list.push(id);
    else map.set(owner, [id]);
  }
  return map;
}
