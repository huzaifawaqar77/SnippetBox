import { z } from 'zod'
import { LANGUAGES } from './languages'
import { CODE_FONT_SIZE_MAX, CODE_FONT_SIZE_MIN, MAX_UI_FONT_SIZE, MIN_UI_FONT_SIZE } from './constants'

const nonEmptyTrimmed = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be ${max} characters or fewer.`)

export const languageIdSchema = z
  .string()
  .trim()
  .max(40)
  .refine((value) => value === '' || LANGUAGES.some((language) => language.id === value), {
    message: 'Unknown language.'
  })

export const tagNameSchema = z
  .string()
  .trim()
  .min(1, 'Tag names cannot be empty.')
  .max(48, 'Tag names must be 48 characters or fewer.')
  .refine((value) => !value.includes(','), { message: 'Tag names cannot contain commas.' })

export const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Colour must be a hex value such as #6366F1.')

export const idSchema = z.string().trim().min(1).max(64)

const optionalUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => value === '' || /^https?:\/\//i.test(value), {
    message: 'Source URL must start with http:// or https://'
  })
  .default('')

const isoDateValue = z
  .string()
  .trim()
  .max(40)
  .refine((value) => value === '' || !Number.isNaN(Date.parse(value)), { message: 'Invalid date.' })
  .nullable()

const optionalIsoDate = isoDateValue.default(null)

export const snippetCreateSchema = z.object({
  title: nonEmptyTrimmed(200, 'Title'),
  description: z.string().max(2000).default(''),
  code: z.string().max(400_000).default(''),
  language: languageIdSchema.default('plaintext'),
  notes: z.string().max(200_000).default(''),
  collectionId: idSchema.nullable().default(null),
  sourceUrl: optionalUrl,
  sourceName: z.string().trim().max(200).default(''),
  sourceAuthor: z.string().trim().max(200).default(''),
  sourceFoundAt: optionalIsoDate,
  favorite: z.boolean().default(false),
  tagNames: z.array(tagNameSchema).max(64).default([]),
  relatedIds: z.array(idSchema).max(64).default([])
})

export const snippetUpdateSchema = z.object({
  title: nonEmptyTrimmed(200, 'Title').optional(),
  description: z.string().max(2000).optional(),
  code: z.string().max(400_000).optional(),
  language: languageIdSchema.optional(),
  notes: z.string().max(200_000).optional(),
  collectionId: idSchema.nullable().optional(),
  sourceUrl: optionalUrl.optional(),
  sourceName: z.string().trim().max(200).optional(),
  sourceAuthor: z.string().trim().max(200).optional(),
  sourceFoundAt: isoDateValue.optional(),
  favorite: z.boolean().optional(),
  tagNames: z.array(tagNameSchema).max(64).optional(),
  relatedIds: z.array(idSchema).max(64).optional(),
  snapshot: z.boolean().optional()
})

export const viewIdSchema = z.enum([
  'all',
  'favorites',
  'recent-added',
  'recent-updated',
  'recent-opened',
  'most-used',
  'trash',
  'tag',
  'collection'
])

export const sortKeySchema = z.enum(['relevance', 'updated', 'created', 'title', 'opened', 'copies'])

export const snippetListOptionsSchema = z.object({
  view: viewIdSchema.default('all'),
  query: z.string().max(500).default(''),
  tagIds: z.array(idSchema).max(64).optional(),
  collectionId: idSchema.nullable().optional(),
  language: z.string().trim().max(40).nullable().optional(),
  favorite: z.boolean().optional(),
  sort: sortKeySchema.optional(),
  limit: z.number().int().min(1).max(500).default(200),
  offset: z.number().int().min(0).default(0),
  includeTrashed: z.boolean().optional()
})

export const tagCreateSchema = z.object({
  name: tagNameSchema,
  color: hexColorSchema.optional(),
  icon: z.string().trim().max(40).nullable().optional()
})

export const tagUpdateSchema = z.object({
  name: tagNameSchema.optional(),
  color: hexColorSchema.optional(),
  icon: z.string().trim().max(40).nullable().optional()
})

export const collectionCreateSchema = z.object({
  name: nonEmptyTrimmed(120, 'Collection name'),
  parentId: idSchema.nullable().optional()
})

export const collectionUpdateSchema = z.object({
  name: nonEmptyTrimmed(120, 'Collection name').optional(),
  parentId: idSchema.nullable().optional()
})

const backupFrequencySchema = z.enum(['off', 'daily', 'weekly'])
const themeSchema = z.enum(['light', 'dark', 'system'])

export const settingsPatchSchema = z
  .object({
    theme: themeSchema,
    codeFont: z.string().trim().max(80),
    codeFontSize: z.number().int().min(CODE_FONT_SIZE_MIN).max(CODE_FONT_SIZE_MAX),
    uiFontSize: z.number().int().min(MIN_UI_FONT_SIZE).max(MAX_UI_FONT_SIZE),
    tabSize: z.union([z.literal(2), z.literal(4), z.literal(8)]),
    showLineNumbers: z.boolean(),
    wordWrap: z.boolean(),
    minimap: z.boolean(),
    sidebarWidth: z.number().int().min(180).max(480),
    sidebarCollapsed: z.boolean(),
    animations: z.boolean(),
    compactMode: z.boolean(),
    confirmDestructive: z.boolean(),
    rememberLastLocation: z.boolean(),
    startOnLogin: z.boolean(),
    restoreLastSnippet: z.boolean(),
    dataLocation: z.string().max(4096),
    backupLocation: z.string().max(4096),
    autoBackup: backupFrequencySchema,
    telemetry: z.boolean(),
    clipboardIntegration: z.boolean(),
    trackUsage: z.boolean(),
    globalQuickCapture: z.boolean(),
    quickCaptureShortcut: z.string().trim().max(80),
    globalSearch: z.boolean(),
    globalSearchShortcut: z.string().trim().max(80),
    onboardingComplete: z.boolean()
  })
  .partial()

export const importCandidateSchema = z.object({
  title: nonEmptyTrimmed(200, 'Title'),
  description: z.string().max(2000).default(''),
  code: z.string().max(400_000).default(''),
  language: languageIdSchema.default('plaintext'),
  tags: z.array(tagNameSchema).max(64).default([]),
  notes: z.string().max(200_000).default(''),
  sourceUrl: z.string().trim().max(2048).default(''),
  sourceName: z.string().trim().max(200).default(''),
  origin: z.string().trim().max(400).default('')
})

export const importCommitSchema = z.array(importCandidateSchema).max(5000)

export const exportRequestSchema = z.object({
  format: z.enum(['json', 'markdown', 'zip']),
  view: viewIdSchema.default('all'),
  ids: z.array(idSchema).max(5000).optional(),
  query: z.string().max(500).optional(),
  includeAttachments: z.boolean().default(false),
  destination: z.string().max(4096).optional()
})

export const filePathsSchema = z.array(z.string().max(4096)).min(1).max(500)

export const similarCodeSchema = z.object({
  code: z.string().max(400_000),
  language: z.string().trim().max(40).optional(),
  excludeId: idSchema.optional()
})

export const relatedIdsSchema = z.array(idSchema).max(64)

export const recordPayloadSchema = z.object({ id: idSchema })

export const favoritePayloadSchema = z.object({ id: idSchema, favorite: z.boolean() })

export const versionSaveSchema = z.object({ id: idSchema, label: z.string().trim().max(120).optional() })

export const openExternalSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => /^https?:\/\//i.test(value), { message: 'Only http(s) URLs can be opened.' })

export const clipboardTextSchema = z.string().max(400_000)

export const windowTitleSchema = z.string().max(300)

export const seedSchema = z
  .object({
    title: z.string().max(200).optional(),
    code: z.string().max(400_000).optional(),
    language: z.string().max(40).optional(),
    tagNames: z.array(tagNameSchema).max(64).optional(),
    description: z.string().max(2000).optional(),
    sourceUrl: z.string().max(2048).optional()
  })
  .optional()

export type SnippetCreateInputValidated = z.infer<typeof snippetCreateSchema>
export type SnippetListOptionsValidated = z.infer<typeof snippetListOptionsSchema>
