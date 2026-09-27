import type { LanguageOption } from './types'

/**
 * Canonical language catalogue. `highlight` names the highlighter family the
 * renderer knows how to load, which is deliberately decoupled from `id` so that
 * several ids (jsx/tsx, sh/zsh) can share one highlighter.
 */
export const LANGUAGES: LanguageOption[] = [
  { id: 'javascript', label: 'JavaScript', extensions: ['js', 'mjs', 'cjs'], aliases: ['js', 'node', 'ecmascript'], color: '#F1E05A', highlight: 'javascript' },
  { id: 'typescript', label: 'TypeScript', extensions: ['ts', 'mts', 'cts'], aliases: ['ts'], color: '#3178C6', highlight: 'typescript' },
  { id: 'jsx', label: 'JSX', extensions: ['jsx'], aliases: ['react'], color: '#61DAFB', highlight: 'jsx' },
  { id: 'tsx', label: 'TSX', extensions: ['tsx'], aliases: ['react-ts'], color: '#3178C6', highlight: 'tsx' },
  { id: 'python', label: 'Python', extensions: ['py', 'pyw', 'pyi'], aliases: ['py', 'python3'], color: '#3572A5', highlight: 'python' },
  { id: 'rust', label: 'Rust', extensions: ['rs'], aliases: ['rs', 'cargo'], color: '#DEA584', highlight: 'rust' },
  { id: 'go', label: 'Go', extensions: ['go'], aliases: ['golang'], color: '#00ADD8', highlight: 'go' },
  { id: 'c', label: 'C', extensions: ['c', 'h'], aliases: ['clang'], color: '#555555', highlight: 'c' },
  { id: 'cpp', label: 'C++', extensions: ['cpp', 'cc', 'cxx', 'hpp', 'hxx'], aliases: ['c++', 'cplusplus'], color: '#F34B7D', highlight: 'cpp' },
  { id: 'csharp', label: 'C#', extensions: ['cs'], aliases: ['c#', 'dotnet', 'cs'], color: '#178600', highlight: 'csharp' },
  { id: 'java', label: 'Java', extensions: ['java'], aliases: [], color: '#B07219', highlight: 'java' },
  { id: 'kotlin', label: 'Kotlin', extensions: ['kt', 'kts'], aliases: [], color: '#A97BFF', highlight: 'kotlin' },
  { id: 'swift', label: 'Swift', extensions: ['swift'], aliases: [], color: '#F05138', highlight: 'swift' },
  { id: 'php', label: 'PHP', extensions: ['php', 'phtml'], aliases: [], color: '#4F5D95', highlight: 'php' },
  { id: 'ruby', label: 'Ruby', extensions: ['rb', 'rake', 'gemspec'], aliases: ['rb'], color: '#CC342D', highlight: 'ruby' },
  { id: 'dart', label: 'Dart', extensions: ['dart'], aliases: ['flutter'], color: '#00B4AB', highlight: 'dart' },
  { id: 'objectivec', label: 'Objective-C', extensions: ['m', 'mm'], aliases: ['objc'], color: '#438EFF', highlight: 'objectivec' },
  { id: 'r', label: 'R', extensions: ['r', 'rmd'], aliases: ['rscript'], color: '#198CE7', highlight: 'r' },
  { id: 'lua', label: 'Lua', extensions: ['lua'], aliases: [], color: '#000080', highlight: 'lua' },
  { id: 'bash', label: 'Bash', extensions: ['sh', 'bash'], aliases: ['sh', 'shell'], color: '#89E051', highlight: 'shell' },
  { id: 'zsh', label: 'Zsh', extensions: ['zsh'], aliases: [], color: '#89E051', highlight: 'shell' },
  { id: 'fish', label: 'Fish', extensions: ['fish'], aliases: [], color: '#4AAE47', highlight: 'shell' },
  { id: 'powershell', label: 'PowerShell', extensions: ['ps1', 'psm1'], aliases: ['pwsh', 'posh'], color: '#3B6FA0', highlight: 'powershell' },
  { id: 'sql', label: 'SQL', extensions: ['sql'], aliases: ['postgres', 'postgresql', 'mysql', 'sqlite'], color: '#E38C00', highlight: 'sql' },
  { id: 'html', label: 'HTML', extensions: ['html', 'htm', 'xhtml'], aliases: ['htm'], color: '#E34C26', highlight: 'html' },
  { id: 'css', label: 'CSS', extensions: ['css'], aliases: [], color: '#8B5CF6', highlight: 'css' },
  { id: 'scss', label: 'SCSS', extensions: ['scss', 'sass', 'less'], aliases: ['sass', 'less'], color: '#C6538C', highlight: 'scss' },
  { id: 'json', label: 'JSON', extensions: ['json', 'jsonc'], aliases: ['jsonc'], color: '#CBCB41', highlight: 'json' },
  { id: 'yaml', label: 'YAML', extensions: ['yml', 'yaml'], aliases: ['yml'], color: '#CB171E', highlight: 'yaml' },
  { id: 'toml', label: 'TOML', extensions: ['toml'], aliases: [], color: '#9C4221', highlight: 'toml' },
  { id: 'ini', label: 'INI', extensions: ['ini', 'cfg', 'conf', 'properties', 'env'], aliases: ['config', 'dotenv'], color: '#6B7280', highlight: 'ini' },
  { id: 'xml', label: 'XML', extensions: ['xml', 'xsl', 'svg', 'plist'], aliases: [], color: '#0060AC', highlight: 'xml' },
  { id: 'markdown', label: 'Markdown', extensions: ['md', 'mdx', 'markdown'], aliases: ['md'], color: '#519ABA', highlight: 'markdown' },
  { id: 'dockerfile', label: 'Dockerfile', extensions: ['dockerfile'], aliases: ['docker', 'containerfile'], color: '#2496ED', highlight: 'dockerfile' },
  { id: 'graphql', label: 'GraphQL', extensions: ['graphql', 'gql'], aliases: ['gql'], color: '#E10098', highlight: 'plaintext' },
  { id: 'nginx', label: 'Nginx', extensions: ['nginxconf'], aliases: ['nginx.conf'], color: '#009639', highlight: 'nginx' },
  { id: 'diff', label: 'Diff', extensions: ['diff', 'patch'], aliases: ['patch'], color: '#6B7280', highlight: 'diff' },
  { id: 'plaintext', label: 'Plain Text', extensions: ['txt', 'text', 'log'], aliases: ['text', 'txt'], color: '#94A3B8', highlight: 'plaintext' },
  { id: 'other', label: 'Other', extensions: [], aliases: [], color: '#94A3B8', highlight: 'plaintext' }
]

export const LANGUAGE_BY_ID = new Map(LANGUAGES.map((language) => [language.id, language]))

export function getLanguage(id: string | null | undefined): LanguageOption | undefined {
  if (!id) return undefined
  return LANGUAGE_BY_ID.get(id) ?? LANGUAGE_BY_ID.get(id.toLowerCase())
}

export function languageLabel(id: string | null | undefined): string {
  return getLanguage(id)?.label ?? 'Plain Text'
}

/** Resolves a free-form token (id, alias, extension or label) to a language id. */
export function resolveLanguageId(token: string | null | undefined): string | null {
  if (!token) return null
  const needle = token.trim().toLowerCase()
  if (!needle) return null
  for (const language of LANGUAGES) {
    if (language.id === needle || language.label.toLowerCase() === needle) return language.id
    if (language.aliases.includes(needle) || language.extensions.includes(needle)) return language.id
  }
  return null
}

const SPECIAL_FILENAMES: Record<string, string> = {
  dockerfile: 'dockerfile',
  containerfile: 'dockerfile',
  makefile: 'plaintext',
  '.bashrc': 'bash',
  '.zshrc': 'zsh',
  '.profile': 'bash',
  '.env': 'ini',
  'cmakelists.txt': 'plaintext',
  'nginx.conf': 'nginx'
}

export function languageFromFilename(filename: string): string | null {
  const base = filename.trim().toLowerCase().split(/[\\/]/).pop() ?? ''
  const special = SPECIAL_FILENAMES[base]
  if (special) return special
  const extension = base.includes('.') ? base.split('.').pop()! : ''
  if (!extension) return null
  for (const language of LANGUAGES) {
    if (language.extensions.includes(extension)) return language.id
  }
  return null
}

interface DetectionRule {
  language: string
  pattern: RegExp
  weight: number
}

const DETECTION_RULES: DetectionRule[] = [
  { language: 'bash', pattern: /^#!\s*\/(?:usr\/bin\/env\s+)?(?:ba|z|fi)?sh\b/m, weight: 100 },
  { language: 'python', pattern: /^#!\s*\/(?:usr\/bin\/env\s+)?python[0-9.]*/m, weight: 100 },
  { language: 'ruby', pattern: /^#!\s*\/(?:usr\/bin\/env\s+)?ruby\b/m, weight: 100 },
  { language: 'javascript', pattern: /^#!\s*\/(?:usr\/bin\/env\s+)?node\b/m, weight: 100 },
  { language: 'php', pattern: /^#!\s*\/(?:usr\/bin\/env\s+)?php\b/m, weight: 100 },

  { language: 'python', pattern: /^\s*(?:def|class)\s+\w+\s*(?:\(.*\))?\s*:/m, weight: 30 },
  { language: 'python', pattern: /^\s*(?:from\s+[\w.]+\s+)?import\s+[\w.*,\s]+$/m, weight: 25 },
  { language: 'python', pattern: /\bif\s+__name__\s*==\s*['"]__main__['"]\s*:/, weight: 40 },
  { language: 'python', pattern: /\bprint\s*\(.*\)\s*$/m, weight: 6 },
  { language: 'python', pattern: /\bself\.\w+/, weight: 10 },

  { language: 'typescript', pattern: /^\s*(?:export\s+)?(?:interface|type)\s+\w+\s*(?:<[^>]*>)?\s*[={]/m, weight: 35 },
  { language: 'typescript', pattern: /:\s*(?:string|number|boolean|void|unknown|any)\b\s*(?:[),=;]|$)/m, weight: 12 },
  { language: 'typescript', pattern: /\b(?:implements|readonly|enum|namespace)\b/, weight: 12 },
  { language: 'tsx', pattern: /:\s*(?:React\.)?(?:FC|ReactNode)\b/, weight: 30 },

  { language: 'javascript', pattern: /\b(?:const|let|var)\s+\w+\s*=\s*require\s*\(/, weight: 30 },
  { language: 'javascript', pattern: /\bmodule\.exports\b/, weight: 25 },
  { language: 'javascript', pattern: /=>\s*[{("'`\[]/, weight: 8 },
  { language: 'javascript', pattern: /\bconsole\.(?:log|error|warn)\s*\(/, weight: 8 },
  { language: 'javascript', pattern: /\bfunction\s+\w*\s*\([^)]*\)\s*\{/, weight: 8 },

  { language: 'rust', pattern: /\bfn\s+\w+\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?:->\s*[^ {]+)?\s*\{/, weight: 30 },
  { language: 'rust', pattern: /\b(?:let\s+mut|impl|pub\s+fn|use\s+std::|#\[derive\()/, weight: 30 },

  { language: 'go', pattern: /^\s*package\s+\w+\s*$/m, weight: 35 },
  { language: 'go', pattern: /\bfunc\s+(?:\([^)]*\)\s*)?\w+\s*\([^)]*\)\s*(?:\([^)]*\)\s*)?\{/, weight: 25 },
  { language: 'go', pattern: /\bfmt\.\w+\(/, weight: 20 },

  { language: 'csharp', pattern: /\busing\s+System(?:\.\w+)*\s*;/, weight: 40 },
  { language: 'csharp', pattern: /\bpublic\s+(?:static\s+)?(?:void|class|string|int)\b/, weight: 18 },
  { language: 'csharp', pattern: /\bConsole\.WriteLine\s*\(/, weight: 30 },

  { language: 'java', pattern: /\bpublic\s+static\s+void\s+main\s*\(/, weight: 45 },
  { language: 'java', pattern: /\bimport\s+java(?:x)?\.\w+/, weight: 40 },
  { language: 'java', pattern: /\bSystem\.out\.print/, weight: 30 },

  { language: 'kotlin', pattern: /\bfun\s+\w+\s*\([^)]*\)\s*(?::\s*\w+)?\s*[={]/, weight: 30 },
  { language: 'kotlin', pattern: /\b(?:val|var)\s+\w+\s*(?::\s*\w+)?\s*=/, weight: 10 },

  { language: 'swift', pattern: /\b(?:import\s+(?:Swift|Foundation|UIKit|SwiftUI))\b/, weight: 40 },
  { language: 'swift', pattern: /\bfunc\s+\w+\s*\([^)]*\)\s*(?:->\s*[^{]+)?\s*\{/, weight: 18 },
  { language: 'swift', pattern: /\b(?:guard|let)\s+\w+\s*=/, weight: 8 },

  { language: 'php', pattern: /<\?php\b/, weight: 60 },
  { language: 'php', pattern: /\$\w+\s*=\s*.*;/, weight: 8 },
  { language: 'php', pattern: /\becho\s+['"]/, weight: 12 },

  { language: 'ruby', pattern: /\b(?:require|require_relative)\s+['"]/, weight: 25 },
  { language: 'ruby', pattern: /\bdef\s+\w+[!?]?\s*(?:\([^)]*\))?\s*$/m, weight: 22 },
  { language: 'ruby', pattern: /\bend\s*$/m, weight: 6 },
  { language: 'ruby', pattern: /\bputs\s+/, weight: 14 },

  { language: 'dart', pattern: /^\s*import\s+['"]package:/m, weight: 35 },
  { language: 'dart', pattern: /\bvoid\s+main\s*\(\)\s*\{/, weight: 30 },
  { language: 'dart', pattern: /\bWidget\s+build\s*\(/, weight: 25 },

  { language: 'objectivec', pattern: /#import\s+<Foundation\/Foundation\.h>/, weight: 45 },
  { language: 'objectivec', pattern: /@(?:interface|implementation|autoreleasepool)\b/, weight: 40 },

  { language: 'cpp', pattern: /#include\s+<(?:iostream|vector|string|map|memory|algorithm)>/, weight: 45 },
  { language: 'cpp', pattern: /\bstd::\w+/, weight: 30 },
  { language: 'cpp', pattern: /\b(?:template|namespace|class)\s*</, weight: 20 },
  { language: 'cpp', pattern: /\bnullptr\b/, weight: 15 },

  { language: 'c', pattern: /#include\s+<(?:stdio|stdlib|string|unistd|stdint)\.h>/, weight: 45 },
  { language: 'c', pattern: /\bprintf\s*\(/, weight: 18 },
  { language: 'c', pattern: /\b(?:int|void|char|struct)\s+\w+\s*\([^;]*\)\s*\{/, weight: 8 },

  { language: 'lua', pattern: /\blocal\s+\w+\s*=/, weight: 25 },
  { language: 'lua', pattern: /\bfunction\s+\w*(?:\.\w+)*\s*\([^)]*\)/, weight: 15 },
  { language: 'lua', pattern: /\bend\s*$/m, weight: 5 },

  { language: 'r', pattern: /<-\s*(?:function|c\(|read\.)/, weight: 40 },
  { language: 'r', pattern: /\blibrary\s*\(\s*\w+\s*\)/, weight: 30 },

  { language: 'sql', pattern: /\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+(?:TABLE|INDEX|VIEW)|ALTER\s+TABLE)\b/i, weight: 35 },
  { language: 'sql', pattern: /\bFROM\s+\w+\s+WHERE\b/i, weight: 22 },
  { language: 'sql', pattern: /\bJOIN\s+\w+\s+ON\b/i, weight: 20 },

  { language: 'dockerfile', pattern: /^\s*FROM\s+[\w./:@-]+(?:\s+AS\s+\w+)?\s*$/im, weight: 45 },
  { language: 'dockerfile', pattern: /^\s*(?:RUN|CMD|ENTRYPOINT|COPY|ADD|WORKDIR|EXPOSE|ENV|ARG|VOLUME|USER|HEALTHCHECK)\s+/m, weight: 25 },

  { language: 'yaml', pattern: /^[a-zA-Z_][\w-]*:\s*(?:$|[^:\n]*)$/m, weight: 14 },
  { language: 'yaml', pattern: /^---\s*$/m, weight: 20 },
  { language: 'yaml', pattern: /^\s*-\s+\w+:\s+/m, weight: 18 },

  { language: 'toml', pattern: /^\[[a-zA-Z0-9_.-]+\]\s*$/m, weight: 30 },
  { language: 'toml', pattern: /^\s*\w+\s*=\s*(?:"[^"]*"|\d+|true|false)\s*$/m, weight: 10 },

  { language: 'ini', pattern: /^\s*\[[^\]]+\]\s*$/m, weight: 18 },
  { language: 'ini', pattern: /^\s*[A-Za-z_][\w.]*\s*=\s*[^\n]*$/m, weight: 8 },

  { language: 'html', pattern: /<!DOCTYPE\s+html>/i, weight: 55 },
  { language: 'html', pattern: /<\/(?:html|body|div|head|title|section|p)>/i, weight: 25 },
  { language: 'xml', pattern: /<\?xml\s+version=/i, weight: 55 },
  { language: 'xml', pattern: /<[a-zA-Z][\w:-]*(?:\s+[\w:-]+="[^"]*")*\s*\/?>/i, weight: 12 },
  { language: 'graphql', pattern: /\b(?:query|mutation|subscription)\s+\w*\s*[{(]/, weight: 35 },
  { language: 'graphql', pattern: /^\s*type\s+\w+\s*\{/m, weight: 25 },
  { language: 'css', pattern: /^[^{}]*\{[^{}]*(?:color|margin|padding|display|font-size)\s*:/m, weight: 20 },
  { language: 'css', pattern: /@(?:media|import|keyframes)\b/, weight: 18 },
  { language: 'scss', pattern: /\$\w+\s*:\s*[^;]+;/, weight: 35 },
  { language: 'scss', pattern: /@(?:mixin|include|extend)\b/, weight: 30 },
  { language: 'javascript', pattern: /^\s*(?:import|export)\s+.*from\s+['"]/, weight: 20 },
  { language: 'json', pattern: /^\s*[[{][\s\S]*[\]}]\s*$/, weight: 12 },
  { language: 'json', pattern: /"\w+"\s*:\s*(?:"|\d|true|false|null|\[|\{)/, weight: 18 },
  { language: 'markdown', pattern: /^#{1,6}\s+\S/m, weight: 28 },
  { language: 'markdown', pattern: /^\s*(?:[-*+]|\d+\.)\s+\S/m, weight: 12 },
  { language: 'markdown', pattern: /```/, weight: 22 },
  { language: 'markdown', pattern: /\[[^\]]+\]\([^)]+\)/, weight: 12 },
  { language: 'diff', pattern: /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/m, weight: 50 },
  { language: 'diff', pattern: /^(?:\+\+\+|---)\s+\S+/m, weight: 35 },
  { language: 'nginx', pattern: /\b(?:server|location|upstream)\s*\{/, weight: 22 },
  { language: 'powershell', pattern: /\b(?:Get|Set|New|Remove|Start|Stop|Test)-\w+\b/, weight: 40 },
  { language: 'powershell', pattern: /\$env:\w+/, weight: 25 },
  { language: 'bash', pattern: /^\s*(?:if|then|fi|for|do|done|while|case|esac)\b[\s;]/m, weight: 12 },
  { language: 'bash', pattern: /\$\{?\w+\}?\s*(?:==|!=)/, weight: 10 },
  { language: 'bash', pattern: /\bsudo\b|\bapt-get\b|\byum\b|\bsystemctl\b/, weight: 22 },
  { language: 'bash', pattern: /^\s*(?:echo|export|cd|mkdir|rm|cp|mv|chmod|chown|grep|awk|sed|curl|wget|tar|find|xargs|kill|cat|ls)\b[\s;]/m, weight: 18 },
  { language: 'bash', pattern: /\|\s*(?:grep|awk|sed|sort|uniq|head|tail|xargs|wc)\b/, weight: 20 },
  { language: 'bash', pattern: /^\s*[A-Z_][A-Z0-9_]*=\S+/, weight: 8 }
]

const EXTENSION_FALLBACK_WEIGHT = 60

/**
 * Best-effort language detection. Never authoritative — the caller always shows
 * the suggestion and lets the user override it.
 */
export function detectLanguage(code: string, filename?: string): string | null {
  const source = code ?? ''
  if (!source.trim() && !filename) return null

  if (filename) {
    const fromName = languageFromFilename(filename)
    if (fromName) return fromName
  }

  const sample = source.slice(0, 20000)
  const scores = new Map<string, number>()

  for (const rule of DETECTION_RULES) {
    if (rule.pattern.test(sample)) {
      scores.set(rule.language, (scores.get(rule.language) ?? 0) + rule.weight)
    }
  }

  // A shebang is decisive even if other heuristics disagree.
  if (source.startsWith('#!')) {
    const shebang = source.split('\n', 1)[0]!.toLowerCase()
    if (/\b(?:ba|z)?sh\b/.test(shebang)) scores.set('bash', (scores.get('bash') ?? 0) + EXTENSION_FALLBACK_WEIGHT)
    if (shebang.includes('python')) scores.set('python', (scores.get('python') ?? 0) + EXTENSION_FALLBACK_WEIGHT)
    if (shebang.includes('node')) scores.set('javascript', (scores.get('javascript') ?? 0) + EXTENSION_FALLBACK_WEIGHT)
  }

  let best: string | null = null
  let bestScore = 0
  for (const [language, score] of scores) {
    if (score > bestScore) {
      best = language
      bestScore = score
    }
  }

  return bestScore >= 20 ? best : null
}
