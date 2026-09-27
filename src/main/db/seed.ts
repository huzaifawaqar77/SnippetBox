import { createCollection, listCollections } from './repositories/collections'
import { createSnippet, listSnippets } from './repositories/snippets'
import type { SnippetCreateInput } from '@shared/types'

interface SampleSnippet extends SnippetCreateInput {
  collection?: string
}

const SAMPLES: SampleSnippet[] = [
  {
    title: 'Check if a port is in use',
    description: 'Bash command to check whether a specific port is already being used on a Linux system.',
    language: 'bash',
    code: `#!/bin/bash

PORT=8080

if lsof -i :"$PORT" &> /dev/null; then
    echo "Port $PORT is already in use"
else
    echo "Port $PORT is available"
fi`,
    notes: `## Why this works

\`lsof -i :PORT\` lists every open file descriptor bound to that port, including
network sockets. Redirecting to \`/dev/null\` keeps the output clean so the exit
code is all we need.

## Important

Replace \`8080\` with the port you want to check. On some systems you need
\`sudo\` to see sockets owned by other users.`,
    tagNames: ['linux', 'bash', 'network'],
    favorite: true,
    sourceUrl: 'https://man7.org/linux/man-pages/man8/lsof.8.html',
    sourceName: 'lsof manual',
    collection: 'Linux'
  },
  {
    title: 'Find which process is using a port',
    description: 'Find which process is currently listening on or connected to a TCP port.',
    language: 'bash',
    code: `# Option 1 — lsof (shows the process name and PID)
sudo lsof -nP -i :8080

# Option 2 — ss (no extra packages required)
sudo ss -ltnp 'sport = :8080'

# Option 3 — fuser
sudo fuser -v 8080/tcp`,
    tagNames: ['linux', 'network', 'debugging'],
    notes: `\`-n\` disables DNS lookups and \`-P\` disables port-to-service name lookups,
which makes both commands noticeably faster.

The \`ss\` filter uses \`sport\` for the *source* port, which is the listening port.`,
    sourceUrl: 'https://man7.org/linux/man-pages/man8/ss.8.html',
    sourceName: 'ss manual',
    collection: 'Linux'
  },
  {
    title: 'Find large files on disk',
    description: 'Recursively list files bigger than 100 MB, largest first.',
    language: 'bash',
    code: `find . -type f -size +100M -exec du -h {} + | sort -rh | head -20`,
    notes: `Add \`-xdev\` to stay on one filesystem and avoid descending into mounted
drives. Swap \`head -20\` for \`less\` when you want to browse.`,
    tagNames: ['linux', 'filesystem'],
    collection: 'Linux'
  },
  {
    title: 'Deep copy an object',
    description: 'Create an independent copy of a nested JavaScript object.',
    language: 'javascript',
    code: `const original = { user: { name: 'Ada', tags: ['math', 'code'] } }

// Modern runtimes and browsers
const copy = structuredClone(original)

// Fallback for JSON-safe data only (drops functions, dates and Map/Set)
const jsonCopy = JSON.parse(JSON.stringify(original))

copy.user.tags.push('analytics')
console.log(original.user.tags) // [ 'math', 'code' ] — untouched`,
    notes: `\`structuredClone\` handles \`Date\`, \`Map\`, \`Set\`, \`ArrayBuffer\` and circular
references. The JSON round-trip does not — it silently converts dates to strings
and throws on circular structures.`,
    tagNames: ['javascript', 'objects'],
    collection: 'Frontend'
  },
  {
    title: 'Debounce a function',
    description: 'Delay a function call until the caller stops invoking it.',
    language: 'javascript',
    code: `export function debounce(fn, wait = 300) {
  let timer

  const debounced = (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }

  debounced.cancel = () => clearTimeout(timer)
  return debounced
}

const onResize = debounce(() => console.log('resized'), 200)
window.addEventListener('resize', onResize)`,
    notes: `Use debounce for search inputs and resize handlers. Reach for *throttle*
instead when you need a guaranteed update rate — for example scroll position
reporting.`,
    tagNames: ['javascript', 'frontend', 'performance'],
    collection: 'Frontend'
  },
  {
    title: 'Read a file line by line',
    description: 'Iterate over a text file one line at a time without loading it all into memory.',
    language: 'python',
    code: `with open("data.txt", "r", encoding="utf-8") as handle:
    for number, line in enumerate(handle, start=1):
        print(number, line.rstrip("\\n"))`,
    notes: `The file object is an iterator, so memory usage stays flat even for very
large files. Always pass \`encoding="utf-8"\` — the platform default differs
between Linux, macOS and Windows.`,
    tagNames: ['python', 'files'],
    collection: 'Backend'
  },
  {
    title: 'Sort a list of dictionaries',
    description: 'Sort a list of records by one key, ascending or descending.',
    language: 'python',
    code: `rows = [
    {"name": "Ada", "age": 36},
    {"name": "Grace", "age": 45},
    {"name": "Linus", "age": 55},
]

rows.sort(key=lambda row: row["age"], reverse=True)
print(rows)`,
    notes: `\`list.sort()\` sorts in place and returns \`None\`; use \`sorted(rows, key=...)\`
when you need a new list. To sort by two keys, return a tuple:
\`key=lambda row: (row["team"], -row["age"])\`.`,
    tagNames: ['python'],
    collection: 'Backend'
  },
  {
    title: 'Undo the last Git commit',
    description: 'Move the last commit back into the staging area without losing any work.',
    language: 'bash',
    code: `# Keep the changes staged so you can commit them again
git reset --soft HEAD~1

# Keep the changes, unstaged
git reset HEAD~1

# Discard the commit AND its changes (destructive)
git reset --hard HEAD~1`,
    notes: `\`HEAD~1\` walks one commit back. Use \`HEAD~3\` to undo three commits at once.

If the commit has already been pushed, prefer \`git revert <sha>\`: rewriting
published history forces everyone else to recover manually.`,
    tagNames: ['git', 'version-control'],
    collection: 'DevOps'
  },
  {
    title: 'Run a Docker container in detached mode',
    description: 'Start a container in the background with a published port and a name.',
    language: 'bash',
    code: `docker run -d \\
  --name web \\
  -p 8080:80 \\
  --restart unless-stopped \\
  nginx:alpine

docker logs -f web`,
    notes: `\`-d\` detaches, \`-p host:container\` publishes a port and \`--restart\`
keeps the container alive across reboots. Always name containers you plan to
manage by hand — otherwise you are stuck dealing with generated names.`,
    tagNames: ['docker', 'devops'],
    collection: 'DevOps'
  },
  {
    title: 'Clean up unused Docker data',
    description: 'Reclaim disk space by removing stopped containers, unused images and dangling volumes.',
    language: 'bash',
    code: `# See what would be removed first
docker system df

# Remove stopped containers, unused networks, dangling images and build cache
docker system prune -a

# Also drop unused volumes (this deletes the data inside them)
docker system prune -a --volumes`,
    notes: `Add \`--volumes\` only when you are sure no container needs that data — volume
contents are not recoverable. \`docker system df\` is the safe first step because
it only reports.`,
    tagNames: ['docker', 'devops', 'cleanup'],
    collection: 'DevOps'
  },
  {
    title: 'Docker: inspect a container network',
    description: 'Find the IP address and network settings of a running container.',
    language: 'bash',
    code: `docker inspect -f '{{json .NetworkSettings.Networks}}' web | jq

# Just the first IP address
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' web`,
    notes: `Containers on a user-defined bridge network can resolve each other by
container name, so prefer that over hard-coded IPs — the IP is reassigned on
every recreate.`,
    tagNames: ['docker', 'network', 'devops'],
    collection: 'DevOps'
  },
  {
    title: 'Type-safe environment variables in TypeScript',
    description: 'Parse and validate environment variables once at startup instead of casting at every use.',
    language: 'typescript',
    code: `const required = (name: string): string => {
  const value = process.env[name]
  if (!value) throw new Error(\`Missing required environment variable: \${name}\`)
  return value
}

export const env = {
  databaseUrl: required('DATABASE_URL'),
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: (process.env.NODE_ENV ?? 'development') as 'development' | 'production'
} as const`,
    notes: `Failing at startup beats failing halfway through a request. Export the
result as a frozen object so the rest of the codebase never touches
\`process.env\` directly.`,
    tagNames: ['typescript', 'node', 'configuration'],
    collection: 'Backend'
  }
]

/**
 * Populates a fresh database with a small, genuinely useful set of snippets so
 * the app is never an empty shell on first launch. Returns how many were added.
 */
export function seedSampleData(): number {
  const { total } = listSnippets({ view: 'all', limit: 1 })
  if (total > 0) return 0

  const collections = new Map<string, string>()
  for (const name of ['Frontend', 'Backend', 'DevOps', 'Linux']) {
    collections.set(name, createCollection({ name }).id)
  }

  let created = 0
  for (const sample of SAMPLES) {
    const { collection, ...input } = sample
    createSnippet({
      ...input,
      collectionId: collection ? (collections.get(collection) ?? null) : null
    })
    created += 1
  }

  return created
}

export function existingCollections(): string[] {
  return listCollections().map((collection) => collection.name)
}
