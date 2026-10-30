// What every inloop page shares: escaping, the little Markdown notes are written in, dates, and the
// page shell with its policy, theme switch and print button. Plain module.

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c])

// One line of note text: `code spans` as code, **bold** as strong, the rest escaped. Code spans are
// cut out first, so nothing inside them is read as bold.
export function span(text: unknown): string {
  return String(text ?? '')
    .split(/(`[^`\n]+`)/g)
    .map((part, i) => (i % 2 ? '<code>' + esc(part.slice(1, -1)) + '</code>' : esc(part).replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')))
    .join('')
}

// Note text as Claude writes it: paragraphs, "- " bullets, "1. " steps, code spans and bold.
export function rich(text: unknown): string {
  const out: string[] = []
  for (const block of String(text ?? '').replace(/\r\n/g, '\n').trim().split(/\n\s*\n/)) {
    let list: { tag: 'ul' | 'ol'; items: string[] } | null = null
    let para: string[] = []
    const close = () => {
      if (para.length) out.push('<p>' + para.map(span).join('<br>') + '</p>')
      para = []
      if (list) out.push('<' + list.tag + '>' + list.items.map((x) => '<li>' + span(x) + '</li>').join('') + '</' + list.tag + '>')
      list = null
    }
    for (const line of block.split('\n')) {
      const bullet = /^\s*[-*•]\s+(.*)$/.exec(line)
      const step = /^\s*\d+[.)]\s+(.*)$/.exec(line)
      const tag = bullet ? 'ul' : step ? 'ol' : null
      if (tag) {
        if (para.length || (list && list.tag !== tag)) close()
        if (!list) list = { tag, items: [] }
        list.items.push((bullet ?? step)![1])
      } else if (line.trim()) {
        if (list) close()
        para.push(line.trim())
      }
    }
    close()
  }
  return out.join('')
}

// A date and time in the reader's language, or ISO when the runtime has no Intl
export function when(ts: number | null | undefined, code: string | null, time = true): string {
  if (!ts) return ''
  try {
    return new Intl.DateTimeFormat(code ?? 'en', time ? { dateStyle: 'medium', timeStyle: 'short' } : { timeStyle: 'short' }).format(new Date(ts))
  } catch {
    return new Date(ts).toISOString().slice(0, 16).replace('T', ' ')
  }
}

export type Theme = 'auto' | 'light' | 'dark'

// The page around a body: no network (the policy allows inline style and script only), the theme
// chosen before the first paint so a dark page never flashes light, and a print button.
export function shell(title: string, code: string | null, theme: Theme, css: string, body: string, script: string): string {
  const fixed = theme === 'auto' ? '' : ' data-theme="' + theme + '" data-fixed'
  return '<!doctype html>\n<html lang="' + esc(code ?? 'en') + '"' + fixed + '>\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; img-src data:; base-uri \'none\'; form-action \'none\'">\n' +
    '<meta name="generator" content="inloop">\n<title>' + esc(title) + '</title>\n' +
    '<script>' + THEME_BOOT + '</script>\n<style>' + css + '</style>\n</head>\n<body>\n<div class="wrap">\n' +
    body + '\n</div>\n<script>' + script + '</script>\n</body>\n</html>\n'
}

// Runs before the page is drawn: a theme the reader picked earlier wins over the system's, unless
// the page was written with a fixed theme.
const THEME_BOOT = `(function(){var d=document.documentElement;if(d.hasAttribute('data-fixed'))return;try{var t=localStorage.getItem('inloop.theme');if(t==='light'||t==='dark')d.setAttribute('data-theme',t)}catch(e){}})();`
