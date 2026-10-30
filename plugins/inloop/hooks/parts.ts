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

// The tags to show notes with: the tags they were written with and, for parts written beyond those
// (an inloop skill fills every part it needs, whatever the tags), the tags that name them, fewest
// first, so the page and the Markdown never leave out what the notes hold
export function tagsShowing(tags: Tag[], parts: Part[] = []): Tag[] {
  const shown = new Set(tags)
  const named = new Set(partsOf(tags).note)
  const left = new Set(parts.filter((p) => !named.has(p)))
  while (left.size) {
    let best: Tag | null = null
    let gain = 0
    for (const t of TAGS) {
      if (t === 'all') continue
      const g = PARTS_OF[t].note.filter((p) => left.has(p)).length
      if (g > gain || (g && g === gain && PARTS_OF[t].note.length < PARTS_OF[best!].note.length)) [best, gain] = [t, g]
    }
    if (!best) break
    shown.add(best)
    for (const p of PARTS_OF[best].note) left.delete(p)
  }
  return shown.has('all') ? ['all'] : TAGS.filter((t) => shown.has(t))
}
