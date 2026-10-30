// Which parts of a note and of a recap each tag asks Claude to write. Every note has its title,
// files, tldr, what and why; every recap its overview. A part no chosen tag names is left out of the
// instructions and of the tools' schemas, so Claude never spends tokens on it. Plain module.

import { TAGS, type Tag } from './config.ts'

export type Part = 'lines' | 'removed' | 'symbols' | 'uses' | 'parameters' | 'terms' | 'alternatives' | 'impact' | 'risks'
export type RecapPart = 'reading_order' | 'groups' | 'check_by_hand' | 'outcomes' | 'setup' | 'conventions' | 'questions' | 'first_tasks'

export const PARTS: Part[] = ['lines', 'removed', 'symbols', 'uses', 'parameters', 'terms', 'alternatives', 'impact', 'risks']
export const RECAP_PARTS: RecapPart[] = ['reading_order', 'groups', 'check_by_hand', 'outcomes', 'setup', 'conventions', 'questions', 'first_tasks']

const LEARN: Part[] = ['lines', 'removed', 'symbols', 'uses', 'parameters', 'terms']

export const PARTS_OF: Record<Tag, { note: Part[]; recap: RecapPart[] }> = {
  summary: { note: [], recap: ['check_by_hand', 'outcomes'] },
  review: { note: ['lines', 'removed', 'symbols', 'alternatives', 'impact', 'risks'], recap: ['reading_order', 'check_by_hand', 'outcomes'] },
  learn: { note: LEARN, recap: ['reading_order', 'outcomes'] },
  decisions: { note: ['alternatives', 'impact', 'risks'], recap: ['check_by_hand', 'outcomes'] },
  architecture: { note: ['impact', 'risks'], recap: ['groups', 'check_by_hand'] },
  onboarding: { note: [...LEARN, 'impact'], recap: ['reading_order', 'groups', 'check_by_hand', 'outcomes', 'setup', 'conventions', 'questions', 'first_tasks'] },
  all: { note: PARTS, recap: RECAP_PARTS },
}

// The parts the chosen tags ask for, in a fixed order
export function partsOf(tags: Tag[]): { note: Part[]; recap: RecapPart[] } {
  const note = new Set(tags.flatMap((t) => PARTS_OF[t].note))
  const recap = new Set(tags.flatMap((t) => PARTS_OF[t].recap))
  return { note: PARTS.filter((p) => note.has(p)), recap: RECAP_PARTS.filter((p) => recap.has(p)) }
}

// The tags a set of written parts satisfies whole, for the page: the notes hold what they ask for
export function tagsCovered(parts: Part[]): Tag[] {
  const have = new Set(parts)
  return TAGS.filter((t) => PARTS_OF[t].note.every((p) => have.has(p)))
}
