import { useEffect, useState } from 'react'
import { AlertTriangle, Check, Hash, Merge, Trash2 } from 'lucide-react'
import { TAG_COLORS } from '@shared/constants'
import { cn } from '../../lib/utils'
import { Button, Field, Input, Separator } from '@/components/ui/primitives'
import { Modal, Select } from '@/components/ui/overlays'
import { useLibraryStore } from '../../stores/library'
import { confirmDialog, useUiStore } from '../../stores/ui'
import { api, errorHint, errorMessage } from '../../lib/api'
import { toast } from '../../stores/toast'

/* -------------------------------------------------------------------------- */
/*  Tag create / rename / merge / delete                                       */
/* -------------------------------------------------------------------------- */

export function TagDialog(): React.JSX.Element {
  const dialog = useUiStore((state) => state.tagDialog)
  const close = useUiStore((state) => state.closeTagDialog)
  const loadTags = useLibraryStore((state) => state.loadTags)
  const refresh = useLibraryStore((state) => state.refresh)
  const tags = useLibraryStore((state) => state.tags)

  const editing = dialog?.tag ?? null
  const [name, setName] = useState('')
  const [color, setColor] = useState<string>(TAG_COLORS[0]!)
  const [mergeTarget, setMergeTarget] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!dialog) return
    setName(editing?.name ?? '')
    setColor(editing?.color ?? TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)] ?? TAG_COLORS[0]!)
    setMergeTarget('')
    setError(null)
  }, [dialog, editing])

  const save = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Give the tag a name.')
      return
    }

    setBusy(true)
    try {
      if (editing) await api.tags.update(editing.id, { name: trimmed, color })
      else await api.tags.create({ name: trimmed, color })

      await loadTags()
      await refresh({ quiet: true })
      toast.success(editing ? 'Tag updated' : 'Tag created', trimmed)
      close()
    } catch (err) {
      setError(errorHint(err) ?? errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (!editing) return
    const confirmed = await confirmDialog({
      title: `Delete the tag “${editing.name}”?`,
      description: `The tag is removed from ${editing.snippetCount} snippet(s). The snippets themselves are not deleted.`,
      confirmLabel: 'Delete tag',
      destructive: true
    })
    if (!confirmed) return

    try {
      await api.tags.remove(editing.id)
      await loadTags()
      await refresh({ quiet: true })
      toast.success('Tag deleted')
      close()
    } catch (err) {
      toast.error('That tag could not be deleted', errorHint(err) ?? errorMessage(err))
    }
  }

  const merge = async (): Promise<void> => {
    if (!editing || !mergeTarget) return
    const target = tags.find((tag) => tag.id === mergeTarget)
    if (!target) return

    const confirmed = await confirmDialog({
      title: `Merge “${editing.name}” into “${target.name}”?`,
      description: 'Snippets keep every tag they already have. The merged tag is then deleted.',
      confirmLabel: 'Merge tags'
    })
    if (!confirmed) return

    try {
      await api.tags.merge(editing.id, target.id)
      await loadTags()
      await refresh({ quiet: true })
      toast.success('Tags merged', `${editing.name} → ${target.name}`)
      close()
    } catch (err) {
      toast.error('Those tags could not be merged', errorHint(err) ?? errorMessage(err))
    }
  }

  return (
    <Modal
      open={dialog !== null}
      onOpenChange={(open) => !open && close()}
      title={editing ? `Edit tag “${editing.name}”` : 'New tag'}
      size="sm"
      footer={
        <>
          {editing ? (
            <Button
              variant="ghost"
              className="mr-auto text-danger hover:bg-danger-soft hover:text-danger"
              icon={<Trash2 className="size-3.5" />}
              onClick={() => void remove()}
            >
              Delete
            </Button>
          ) : null}
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            {editing ? 'Save changes' : 'Create tag'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" required error={error} htmlFor="tag-name">
          <Input
            id="tag-name"
            autoFocus
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void save()
            }}
            placeholder="docker"
            maxLength={48}
          />
        </Field>

        <div className="space-y-1.5">
          <span className="text-xs font-medium text-fg-secondary">Colour</span>
          <div className="flex flex-wrap gap-1.5">
            {TAG_COLORS.map((option) => (
              <button
                key={option}
                type="button"
                aria-label={`Use colour ${option}`}
                onClick={() => setColor(option)}
                className={cn(
                  'grid size-6 place-items-center rounded-[6px] transition-transform hover:scale-105',
                  color === option && 'ring-2 ring-primary ring-offset-2 ring-offset-surface'
                )}
                style={{ backgroundColor: option }}
              >
                {color === option ? <Check className="size-3 text-white" /> : null}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-md border border-line bg-sunken px-2.5 py-2">
          <Hash className="size-3.5 text-subtle" />
          <span className="text-2xs text-muted">
            Tags are free-form. Rename, recolour or merge them whenever your vocabulary changes.
          </span>
        </div>

        {editing && tags.length > 1 ? (
          <>
            <Separator />
            <div className="space-y-1.5">
              <span className="flex items-center gap-1.5 text-xs font-medium text-fg-secondary">
                <Merge className="size-3.5" />
                Merge into another tag
              </span>
              <div className="flex items-center gap-2">
                <Select
                  ariaLabel="Merge target"
                  value={mergeTarget || '__none__'}
                  onValueChange={(value) => setMergeTarget(value === '__none__' ? '' : value)}
                  options={[
                    { value: '__none__', label: 'Choose a tag…' },
                    ...tags
                      .filter((tag) => tag.id !== editing.id)
                      .map((tag) => ({ value: tag.id, label: `${tag.name} (${tag.snippetCount})` }))
                  ]}
                />
                <Button variant="secondary" disabled={!mergeTarget} onClick={() => void merge()}>
                  Merge
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  )
}

/* -------------------------------------------------------------------------- */
/*  Collection create / rename / delete                                        */
/* -------------------------------------------------------------------------- */

export function CollectionDialog(): React.JSX.Element {
  const dialog = useUiStore((state) => state.collectionDialog)
  const close = useUiStore((state) => state.closeCollectionDialog)
  const loadCollections = useLibraryStore((state) => state.loadCollections)
  const refresh = useLibraryStore((state) => state.refresh)
  const collections = useLibraryStore((state) => state.collections)

  const editing = dialog?.collection ?? null
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('__none__')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!dialog) return
    setName(editing?.name ?? '')
    setParentId(editing?.parentId ?? '__none__')
    setError(null)
  }, [dialog, editing])

  const save = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Give the collection a name.')
      return
    }

    setBusy(true)
    try {
      const parent = parentId === '__none__' ? null : parentId
      if (editing) await api.collections.update(editing.id, { name: trimmed, parentId: parent })
      else await api.collections.create({ name: trimmed, parentId: parent })

      await loadCollections()
      await refresh({ quiet: true })
      toast.success(editing ? 'Collection updated' : 'Collection created', trimmed)
      close()
    } catch (err) {
      setError(errorHint(err) ?? errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (!editing) return
    const confirmed = await confirmDialog({
      title: `Delete the collection “${editing.name}”?`,
      description: `${editing.snippetCount} snippet(s) will stay in your library but lose this collection. Nested collections move to the top level.`,
      confirmLabel: 'Delete collection',
      destructive: true
    })
    if (!confirmed) return

    try {
      await api.collections.remove(editing.id)
      await loadCollections()
      await refresh({ quiet: true })
      toast.success('Collection deleted')
      close()
    } catch (err) {
      toast.error('That collection could not be deleted', errorHint(err) ?? errorMessage(err))
    }
  }

  // A collection cannot be nested inside itself or its own descendants.
  const descendantIds = editing ? collectDescendants(editing.id, collections) : new Set<string>()

  return (
    <Modal
      open={dialog !== null}
      onOpenChange={(open) => !open && close()}
      title={editing ? `Edit collection “${editing.name}”` : 'New collection'}
      size="sm"
      footer={
        <>
          {editing ? (
            <Button
              variant="ghost"
              className="mr-auto text-danger hover:bg-danger-soft hover:text-danger"
              icon={<Trash2 className="size-3.5" />}
              onClick={() => void remove()}
            >
              Delete
            </Button>
          ) : null}
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            {editing ? 'Save changes' : 'Create collection'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name" required error={error} htmlFor="collection-name">
          <Input
            id="collection-name"
            autoFocus
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void save()
            }}
            placeholder="DevOps"
            maxLength={120}
          />
        </Field>

        <Field label="Inside" hint="Optional — collections can be nested.">
          <Select
            ariaLabel="Parent collection"
            value={parentId}
            onValueChange={setParentId}
            options={[
              { value: '__none__', label: 'Top level' },
              ...collections
                .filter((collection) => collection.id !== editing?.id && !descendantIds.has(collection.id))
                .map((collection) => ({ value: collection.id, label: collection.name }))
            ]}
          />
        </Field>
      </div>
    </Modal>
  )
}

function collectDescendants(rootId: string, collections: Array<{ id: string; parentId: string | null }>): Set<string> {
  const result = new Set<string>()
  const queue = [rootId]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const collection of collections) {
      if (collection.parentId === current && !result.has(collection.id)) {
        result.add(collection.id)
        queue.push(collection.id)
      }
    }
  }
  return result
}

/* -------------------------------------------------------------------------- */
/*  Duplicate warning                                                          */
/* -------------------------------------------------------------------------- */

export function DuplicateWarningDialog(): React.JSX.Element | null {
  const warning = useUiStore((state) => state.duplicateWarning)
  if (!warning) return null

  return (
    <Modal
      open
      onOpenChange={(open) => !open && warning.onCancel()}
      title="This looks similar to an existing snippet"
      description="Nothing is blocked — open the existing one, or keep both."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={warning.onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={warning.onProceed}>
            Save anyway
          </Button>
        </>
      }
    >
      <ul className="space-y-1.5">
        {warning.candidates.map((candidate) => (
          <li
            key={candidate.id}
            className="flex items-center gap-2 rounded-lg border border-line bg-sunken px-2.5 py-2"
          >
            <AlertTriangle className="size-3.5 shrink-0 text-warning" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-fg">{candidate.title}</span>
              <span className="block text-2xs text-subtle">
                {Math.round(candidate.score * 100)}% similar
              </span>
            </span>
            <Button size="sm" variant="secondary" onClick={() => warning.onViewExisting(candidate.id)}>
              View existing
            </Button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
