/**
 * GET /collections returns a flat "namespace/collection" list
 * (see ContextManager.list_all() in the backend). Here it is grouped by
 * namespace for the sidebar's hierarchical picker -- the actual selection
 * still lives at the leaf level (conversation.activeCollections); this is
 * only the view.
 */

export interface CollectionGroup {
  namespace: string
  items: string[] // full names "namespace/leaf", already sorted
}

export function groupCollections(flat: string[]): CollectionGroup[] {
  const byNamespace = new Map<string, string[]>()

  for (const full of flat) {
    const slashIndex = full.indexOf("/")
    const namespace = slashIndex === -1 ? full : full.slice(0, slashIndex)
    const items = byNamespace.get(namespace) ?? []
    items.push(full)
    byNamespace.set(namespace, items)
  }

  return Array.from(byNamespace.entries())
    .map(([namespace, items]) => ({ namespace, items: [...items].sort() }))
    .sort((a, b) => a.namespace.localeCompare(b.namespace))
}

export type GroupSelectionState = "all" | "some" | "none"

export function groupSelectionState(
  group: CollectionGroup,
  active: string[]
): GroupSelectionState {
  const activeSet = new Set(active)
  const selectedCount = group.items.filter((item) => activeSet.has(item)).length
  if (selectedCount === 0) return "none"
  if (selectedCount === group.items.length) return "all"
  return "some"
}

/** "sociologia/Colombia" -> "Colombia" (leaf name to display). */
export function leafLabel(fullName: string): string {
  const slashIndex = fullName.indexOf("/")
  return slashIndex === -1 ? fullName : fullName.slice(slashIndex + 1)
}
