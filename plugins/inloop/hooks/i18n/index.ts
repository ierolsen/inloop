// The labels inloop prints, in the language of its notes. A language without its own labels uses
// the English ones; a label missing from a language falls back to English too.

import { en, type Labels } from './en.ts'
import { tr } from './tr.ts'
import { de } from './de.ts'
import { nl } from './nl.ts'

const LABELS: Record<string, Partial<Labels>> = { en, tr, de, nl }

export type Plural = { one: string; other: string; [category: string]: string }

export function labels(code: string | null): Labels {
  const own = code ? LABELS[code] : undefined
  return { ...en, ...(own ?? {}) } as Labels
}

export function hasLabels(code: string | null): boolean {
  return !!code && code in LABELS
}

// The language whose labels are shown for a notes language
export const shownIn = (code: string | null): string => (code && hasLabels(code) ? code : 'en')

// A label with its {placeholders} filled in
export function say(text: string, values: Record<string, string | number> = {}): string {
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m))
}

// A counted label in the form its language uses for n ("1 note", "2 notes"). The plural rules are
// those of the labels shown, so a language that falls back to English labels counts in English.
export function count(code: string | null, forms: Plural, n: number): string {
  let category = n === 1 ? 'one' : 'other'
  try {
    category = new Intl.PluralRules(shownIn(code)).select(n)
  } catch {
    // no plural rules in this runtime: one and other cover the languages inloop ships
  }
  return say(forms[category] ?? forms.other, { count: n })
}

// A language's name as the reader's labels say it, with its own name after it: "Almanca
// (Deutsch)" on Turkish labels, "German (Deutsch)" on English ones.
export function nameOf(lang: { code: string | null; english: string; native: string }, ui: string | null): string {
  let name = lang.english
  if (lang.code) {
    try {
      const shown = new Intl.DisplayNames([shownIn(ui)], { type: 'language' }).of(lang.code)
      if (shown && shown !== lang.code) name = shown
    } catch {
      // no display names in this runtime: the English name
    }
  }
  return !lang.native || name === lang.native ? name : name + ' (' + lang.native + ')'
}
