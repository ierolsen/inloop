// Secrets through the engine: what Claude writes is redacted before inloop records it, and files
// that usually hold secrets are recorded by name only (world.ts holds the project in memory).
import { expect, test } from 'claude-code/testing'
import { worldOf, ROOT, LOG, START, note } from './world.ts'

const edits = (w: { records: () => any[] }) => w.records().filter((r) => r.kind === 'edit')

test('secrets never reach the log: tokens are redacted and a .env file is logged by path only', async ($, on) => {
  const w = worldOf(on)
  const key = 'sk-ant-' + 'k'.repeat(32)
  await $.session.start(START)
  await $.turn.start({ text: 'add the client config', turnId: 't1' })
  await $.tool.call(note({ title: 'Config', files: ['config.py', '.env'], what: 'Reads ' + key, why: 'The client needs a key.' }))
  await $.tool.call({ tool: 'Write', file_path: ROOT + '/config.py', content: 'API_KEY = "' + key + '"\nTIMEOUT = 30\n' } as any)
  await $.tool.call({ tool: 'Write', file_path: ROOT + '/.env', content: 'TOKEN=' + key + '\n' } as any)
  expect(w.files.get(LOG)).not.toContain(key)
  const [config, env] = edits(w)
  expect(config.diff).toContain('+API_KEY = "[redacted]"')
  expect(config.diff).toContain('+TIMEOUT = 30')
  expect(config.redactions).toBe(1)
  expect(env).toMatchObject({ path: '.env', skipped: 'sensitive', diff: null, status: 'ok' })
  expect(w.records().find((r) => r.kind === 'note').note.what).toBe('Reads [redacted]')
  // the files themselves are written as Claude asked
  expect(w.files.get(ROOT + '/.env')).toBe('TOKEN=' + key + '\n')
})
