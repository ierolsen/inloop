// The part a file plays, from its path alone, and the fixed order a reader goes through the parts:
// data and types, logic, interface, tests, configuration, documentation, the rest. Plain module.

export type Role = 'data' | 'logic' | 'ui' | 'tests' | 'config' | 'docs' | 'other'
export const ROLES: Role[] = ['data', 'logic', 'ui', 'tests', 'config', 'docs', 'other']

export function roleOf(path: string): Role {
  const p = path.toLowerCase().replace(/\\/g, '/')
  const name = p.split('/').pop() ?? p
  if (/(^|\/)(tests?|specs?|__tests__|e2e)\//.test(p) || /^test_|_test\.|\.test\.|\.spec\.|_spec\./.test(name)) return 'tests'
  if (/\.(md|mdx|rst|adoc)$/.test(name) || /(^|\/)docs?\//.test(p) || /^(readme|changelog|license|contributing)\b/.test(name)) return 'docs'
  if (/\.(json|ya?ml|toml|ini|cfg|conf|lock)$/.test(name) || /^(dockerfile|makefile|procfile|\.gitignore|\.editorconfig|\.env\.example)$/.test(name) ||
    /\.config\.[a-z]+$/.test(name) || /(^|\/)\.github\//.test(p) || /^requirements.*\.txt$/.test(name)) return 'config'
  if (/(^|\/)(models?|schemas?|entities|migrations|types|db)\//.test(p) || /\.(sql|proto|prisma|graphql|gql|avsc)$/.test(name) ||
    /\.d\.ts$/.test(name) || /^(models|schemas?|types|entities)\.[a-z]+$/.test(name)) return 'data'
  if (/(^|\/)(components?|views?|pages|templates|ui|screens|layouts|styles|static|public)\//.test(p) ||
    /\.(css|scss|sass|less|html?|vue|svelte|jsx|tsx|astro|erb|hbs|njk|jinja2?)$/.test(name)) return 'ui'
  if (/\.(py|js|mjs|cjs|ts|go|rs|rb|java|kt|swift|c|cc|cpp|h|hpp|cs|php|scala|ex|exs|clj|lua|sh|ps1|r|jl|dart|m|mm|zig)$/.test(name)) return 'logic'
  return 'other'
}

// The fixed reading order: by role, then by when each file first changed.
export function fixedOrder(files: string[]): { file: string; role: Role }[] {
  return files
    .map((file, i) => ({ file, i, role: roleOf(file) }))
    .sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || a.i - b.i)
    .map(({ file, role }) => ({ file, role }))
}
