// The live card: the note tool's row in the transcript, drawn as the note itself in the reader's
// language instead of the call's raw arguments; the recap's row likewise. Plain module: register.ts
// hands in the surface's elements (`$.ui.resolve(e)`).

import type { Labels } from '../i18n/en.ts'
import { say } from '../i18n/index.ts'
import type { Note, Recap } from '../note.ts'

// A Markdown or Code leaf holds at most 10,000 characters, a whole tree 100,000.
export const LEAF = 9000
export const clip = (text: string, max = LEAF) => (text.length > max ? text.slice(0, max - 3) + '...' : text)
const code = (s: string) => '`' + s.replace(/`/g, "'") + '`'
const list = (items: string[]) => items.map((x) => '- ' + x).join('\n')
const block = (t: any, title: string, body: string) => t.Markdown({ text: clip('**' + title + '**\n' + body) })

export function head(t: any, parts: string[]): any {
  return t.Text({ children: [t.Text({ color: 'cyan', bold: true, children: 'inloop' }), t.Text({ dimColor: true, children: ' · ' + parts.join(' · ') })] })
}

const frame = (t: any, children: any[]) => t.Box({ flexDirection: 'column', borderStyle: 'round', borderColor: 'cyan', paddingX: 1, children })

export function noteCard(t: any, note: Note, n: number | null, reconstructed: boolean, l: Labels): any {
  const tags = [n ? say(l.page_in_note, { n }) : say(l.page_in_note, { n: '' }).trim()]
  if (note.basis === 'verified') tags.push(l.page_basis_verified)
  if (note.basis === 'judgment') tags.push(l.page_basis_judgment)
  if (reconstructed) tags.push(l.page_reconstructed)
  const parts: any[] = [head(t, tags), t.Text({ bold: true, children: note.title })]
  if (note.tldr) parts.push(t.Text({ color: 'cyan', children: note.tldr }))
  if (note.files.length) parts.push(t.Text({ dimColor: true, children: note.files.join(' · ') }))
  // while Claude still streams the call, fields arrive one by one: draw what has arrived
  if (note.what) parts.push(t.Markdown({ text: clip('**' + l.page_what + ':** ' + note.what) }))
  if (note.why) parts.push(t.Markdown({ text: clip('**' + l.page_why + ':** ' + note.why) }))
  if (note.uses.length) {
    parts.push(block(t, l.page_uses, list(note.uses.map((u) => code(u.name) + ' (' + u.from + '): ' + u.why))))
  }
  if (note.symbols.length) {
    parts.push(block(t, l.page_symbols, list(note.symbols.map((s) => code(s.name) + ' (' + l[('page_kind_' + s.kind) as 'page_kind_class'] + '): ' + s.why_exists))))
  }
  if (note.parameters.length) {
    parts.push(block(t, l.page_parameters, list(note.parameters.map((p) => code(p.name) + (p.value ? ' = ' + code(p.value) : '') +
      (p.default && p.default !== p.value ? ' (' + l.param_default_short + ' ' + code(p.default) + ')' : '') + ': ' + (p.why_this_value || p.meaning)))))
  }
  if (note.removed.length) parts.push(block(t, l.page_removed, list(note.removed.map((x) => '~~' + code(x.anchor) + '~~: ' + x.says))))
  if (note.terms.length) parts.push(block(t, l.r_terms, list(note.terms.map((x) => '**' + x.term.replace(/\*/g, '') + '**: ' + x.means))))
  if (note.impact.length) parts.push(block(t, l.r_impact, list(note.impact)))
  if (note.alternatives.length) parts.push(block(t, l.page_alternatives, list(note.alternatives)))
  if (note.risks.length) parts.push(block(t, l.page_risks, list(note.risks)))
  return frame(t, parts)
}

// A note inloop sent back once for its wording: one line instead of the card, as the reworded note
// that follows is the one kept
export function sentBackRow(t: any, words: string[], l: Labels): any {
  return t.Text({ children: [t.Text({ color: 'cyan', bold: true, children: 'inloop' }), t.Text({ dimColor: true, children: ' · ' + say(l.card_sent_back, { words: words.join(', ') }) })] })
}

export function recapCard(t: any, recap: Recap, l: Labels): any {
  const parts: any[] = [head(t, [l.page_summary])]
  if (recap.overview) parts.push(t.Markdown({ text: clip(recap.overview) }))
  if (recap.reading_order.length) {
    parts.push(block(t, l.page_start_here, recap.reading_order.map((r, i) => i + 1 + '. ' + code(r.file) + (r.why ? ': ' + r.why : '')).join('\n')))
  }
  if (recap.check_by_hand.length) parts.push(block(t, l.page_check, list(recap.check_by_hand)))
  if (recap.outcomes.length) parts.push(block(t, l.card_outcomes, list(recap.outcomes.map((o) => say(l.page_in_note, { n: o.note }) + ': ' + o.says))))
  if (recap.setup.length) parts.push(block(t, l.page_setup, recap.setup.map((s, i) => i + 1 + '. ' + s).join('\n')))
  if (recap.first_tasks.length) parts.push(block(t, l.page_first_tasks, list(recap.first_tasks)))
  return frame(t, parts)
}
