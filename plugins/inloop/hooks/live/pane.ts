// The pane: Claude's notes one at a time, each with the diffs it explains, kept up to date while
// Claude works. Plain module: register.ts hands in the surface's elements and what each button
// does. The surface scrolls the pane's body, so a step is drawn whole within the size limits.

import type { Labels } from '../i18n/en.ts'
import { say, count } from '../i18n/index.ts'
import { fitDiff } from '../diff.ts'
import type { Page, NoteView, EditView, OutsideView } from '../review/model.ts'
import { clip, head, LEAF } from './card.ts'

export const PANE_DIFFS = 60_000 // characters of diff in one drawing, under the tree's 100,000

export type Step =
  | { kind: 'note'; note: NoteView }
  | { kind: 'unexplained'; edits: EditView[] }
  | { kind: 'outside'; entries: OutsideView[]; more: number }

// The pane's steps: each note with its edits; per task, the edits that have no note; last, the
// files changed outside the edit tools that no note names.
export function steps(page: Page): Step[] {
  const out: Step[] = []
  for (const t of page.tasks) {
    for (const item of t.items) if (item.kind === 'note') out.push({ kind: 'note', note: item.note })
    if (t.unexplained.length) out.push({ kind: 'unexplained', edits: t.unexplained })
  }
  if (page.outside.length) out.push({ kind: 'outside', entries: page.outside, more: page.outsideMore })
  return out
}

// The step on screen: the chosen one, or the newest while the pane follows Claude (null)
export const shown = (total: number, index: number | null) => (index === null ? total - 1 : Math.max(0, Math.min(index, total - 1)))

export type Actions = { prev: () => void; next: () => void; latest: () => void; page: () => void; close: () => void }

function change(t: any, x: EditView | OutsideView, l: Labels, budget: { left: number }): any[] {
  const tag = 'tool' in x ? x.tool : l[('page_state_' + x.state) as 'page_state_added']
  const out: any[] = [t.Text({ children: [t.Text({ bold: true, children: x.path }), t.Text({ dimColor: true, children: '  ' + tag + '  ' }),
    t.Text({ color: 'green', children: '+' + x.added }), ' ', t.Text({ color: 'red', children: '-' + x.removed })] })]
  if (x.skipped) out.push(t.Text({ dimColor: true, children: l[('page_skipped_' + x.skipped.replace('-', '_')) as 'page_skipped_binary'] }))
  else if (x.diff) {
    const fitted = budget.left > 500 ? fitDiff(x.diff, Math.min(LEAF, budget.left)) : { text: '', cut: true }
    budget.left -= fitted.text.length
    if (fitted.text) out.push(t.Code({ source: fitted.text, format: 'diff', path: x.path }))
    if (fitted.cut || x.truncated) out.push(t.Text({ dimColor: true, children: l.pane_cut }))
  }
  return out
}

export function paneView(t: any, list: Step[], index: number | null, l: Labels, code: string | null, act: Actions): any {
  const buttons = t.Box({ flexDirection: 'row', flexWrap: 'wrap', columnGap: 2, children: [
    t.Button({ key: 'prev', label: l.pane_prev, hotkey: 'p', onPress: act.prev }),
    t.Button({ key: 'next', label: l.pane_next, hotkey: 'n', autoFocus: true, onPress: act.next }),
    t.Button({ key: 'latest', label: l.pane_latest, hotkey: 'l', onPress: act.latest }),
    t.Button({ key: 'page', label: l.pane_page, hotkey: 'o', onPress: act.page }),
    t.Button({ key: 'close', label: l.pane_close, hotkey: 'c', onPress: act.close }),
  ] })
  if (!list.length) return t.Box({ flexDirection: 'column', rowGap: 1, children: [head(t, [l.pane_following]), t.Text({ dimColor: true, children: l.pane_empty }), buttons] })
  const k = shown(list.length, index)
  const step = list[k]
  const tags = [say(l.pane_position, { n: k + 1, total: list.length })]
  if (index === null) tags.push(l.pane_following)
  const body: any[] = []
  const budget = { left: PANE_DIFFS }
  if (step.kind === 'note') {
    const r = step.note.record
    body.push(t.Text({ bold: true, children: '#' + r.n + ' ' + r.note.title }))
    if (r.note.files.length) body.push(t.Text({ dimColor: true, children: r.note.files.join(' · ') }))
    body.push(t.Markdown({ text: clip('**' + l.page_what + ':** ' + r.note.what) }))
    body.push(t.Markdown({ text: clip('**' + l.page_why + ':** ' + r.note.why) }))
    for (const e of step.note.edits) body.push(...change(t, e, l, budget))
    for (const x of step.note.outside) body.push(...change(t, x, l, budget))
  } else if (step.kind === 'unexplained') {
    body.push(t.Text({ bold: true, color: 'yellow', children: l.page_unexplained }))
    for (const e of step.edits) body.push(...change(t, e, l, budget))
  } else {
    body.push(t.Text({ bold: true, color: 'yellow', children: l.page_outside }))
    for (const x of step.entries) body.push(...change(t, x, l, budget))
    if (step.more) body.push(t.Text({ dimColor: true, children: count(code, l.page_outside_more, step.more) }))
  }
  return t.Box({ flexDirection: 'column', rowGap: 1, children: [head(t, tags), buttons, t.Box({ flexDirection: 'column', children: body })] })
}
