/** Rebase saved media paths in memory while preserving the original artifact files. */
export function relocatePaths(value, from, to) {
  if (!from || !to) throw new Error('Both artifact roots are required');
  const oldRoot = from.replaceAll('\\', '/').replace(/\/$/, '');
  const newRoot = to.replaceAll('\\', '/').replace(/\/$/, '');
  const visit = (item) => {
    if (Array.isArray(item)) return item.map(visit);
    if (item && typeof item === 'object')
      return Object.fromEntries(
        Object.entries(item).map(([key, child]) => [key, visit(child)]),
      );
    if (typeof item !== 'string') return item;
    const path = item.replaceAll('\\', '/');
    return path === oldRoot || path.startsWith(oldRoot + '/')
      ? newRoot + path.slice(oldRoot.length)
      : item;
  };
  return visit(value);
}
