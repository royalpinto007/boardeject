import type { FreeformBoardItem, FreeformTransform } from "libfreeform";

const identity = (t?: FreeformTransform) =>
  !t ||
  (t.a === 1 &&
    t.b === 0 &&
    t.c === 0 &&
    t.d === 1 &&
    t.tx === 0 &&
    t.ty === 0);

/** Resolve validated group ancestry, deepest first as required by Excalidraw.
 * Only identity group transforms are accepted. Nonidentity counter-transform
 * composition is deliberately not guessed from the private field name.
 */
export function groupMembership(
  items: readonly FreeformBoardItem[],
): Map<string, string[]> {
  const byId = new Map(items.map((item) => [item.uuid, item]));
  if (byId.size !== items.length)
    throw new Error("Duplicate native item identity.");
  const parents = new Map<string, string>();
  for (const item of items)
    if (item.kind.kind === "group") {
      if (
        !identity(item.kind.counterTransform) ||
        !identity(item.geometry.transform) ||
        item.geometry.frame?.rotation ||
        item.geometry.horizontalFlip ||
        item.geometry.verticalFlip
      )
        throw new Error(`Group ${item.uuid} has an unvalidated transform.`);
      for (const child of item.kind.childIds) {
        if (!byId.has(child))
          throw new Error("Group references a missing child.");
        if (parents.has(child))
          throw new Error(
            "Group child has multiple owners or duplicate references.",
          );
        parents.set(child, item.uuid);
      }
    }
  for (const item of items)
    if (item.parentId && parents.get(item.uuid) !== item.parentId)
      throw new Error("Parent identity disagrees with group membership.");
  const memberships = new Map<string, string[]>();
  for (const item of items) {
    const chain: string[] = [],
      seen = new Set([item.uuid]);
    let parent = parents.get(item.uuid);
    while (parent) {
      if (seen.has(parent)) throw new Error("Cycle in group hierarchy.");
      if (chain.length >= 128)
        throw new Error("Group hierarchy exceeds 128 levels.");
      seen.add(parent);
      chain.push(parent);
      parent = parents.get(parent);
    }
    memberships.set(item.uuid, chain);
  }
  return memberships;
}
