// Secrets never reach inloop's log: tokens and keys are replaced before anything is written, and
// files that usually hold secrets are logged by path only. Plain module: no mods API calls here.

export const REDACTED = '[redacted]'

const TOKENS: RegExp[] = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/g, // GitLab
  /\b(?:sk|rk)-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b/g, // Anthropic, OpenAI and similar
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g, // Stripe
  /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/g, // Slack
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\bAIza[0-9A-Za-z_-]{35}\b/g, // Google API key
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, // JSON web tokens
  /\bnpm_[A-Za-z0-9]{36}\b/g,
  /\bhf_[A-Za-z0-9]{30,}\b/g, // Hugging Face
]

// `password = "..."`, `api_key: '...'`, `AWS_SECRET_ACCESS_KEY=...`: the name stays, the value goes
const ASSIGNMENT = /\b([A-Za-z0-9_.-]*(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret)[A-Za-z0-9_.-]*)(\s*[:=]\s*)(["']?)([^\s"'`,;]{8,})\3/gi

export function redact(text: string): { text: string; count: number } {
  let count = 0
  let out = text
  for (const pattern of TOKENS) out = out.replace(pattern, () => { count++; return REDACTED })
  out = out.replace(ASSIGNMENT, (whole, name: string, eq: string, quote: string, value: string) => {
    // every value of a secret's name goes, even one that only says where the secret is kept: a
    // shape that looks like a reference can be a secret too (Admin.PASS123)
    if (value === REDACTED || /^(true|false|null|none|undefined)$/i.test(value)) return whole
    count++
    return name + eq + quote + REDACTED + quote
  })
  return { text: out, count }
}

// Every string inside a note or a recap, redacted one by one, with the total count.
export function redactDeep<T>(value: T): { value: T; count: number } {
  let count = 0
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const r = redact(v)
      count += r.count
      return r.text
    }
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
    return v
  }
  return { value: walk(value) as T, count }
}

// Files whose content inloop never reads into its log, only their path.
export function sensitive(path: string): boolean {
  const name = path.replace(/\\/g, '/').split('/').pop() ?? ''
  if (/^\.env(\..+)?$/i.test(name)) return !/\.(example|sample|template|dist)$/i.test(name)
  return /\.(pem|key|p12|pfx|jks|keystore|kdbx|ovpn)$/i.test(name) ||
    /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i.test(name) ||
    /^(credentials|secrets?)(\.[a-z]+)?$/i.test(name) ||
    /^\.(netrc|npmrc|pypirc|git-credentials)$/i.test(name)
}
