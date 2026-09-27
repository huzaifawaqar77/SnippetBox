import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  HighlightStyle,
  StreamLanguage,
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
  type LanguageSupport
} from '@codemirror/language'
import { highlightSelectionMatches, openSearchPanel, search, searchKeymap } from '@codemirror/search'
import { EditorState, type Extension } from '@codemirror/state'
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  placeholder as placeholderExtension,
  rectangularSelection
} from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

import { cpp as cppLanguage } from '@codemirror/lang-cpp'
import { css as cssLanguage } from '@codemirror/lang-css'
import { go as goLanguage } from '@codemirror/lang-go'
import { html as htmlLanguage } from '@codemirror/lang-html'
import { java as javaLanguage } from '@codemirror/lang-java'
import { javascript as javascriptLanguage } from '@codemirror/lang-javascript'
import { json as jsonLanguage } from '@codemirror/lang-json'
import { markdown as markdownLanguage } from '@codemirror/lang-markdown'
import { php as phpLanguage } from '@codemirror/lang-php'
import { python as pythonLanguage } from '@codemirror/lang-python'
import { rust as rustLanguage } from '@codemirror/lang-rust'
import { sql as sqlLanguage } from '@codemirror/lang-sql'
import { xml as xmlLanguage } from '@codemirror/lang-xml'
import { yaml as yamlLanguage } from '@codemirror/lang-yaml'

import { c, csharp, dart, kotlin, objectiveC } from '@codemirror/legacy-modes/mode/clike'
import { diff as diffMode } from '@codemirror/legacy-modes/mode/diff'
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile'
import { lua as luaMode } from '@codemirror/legacy-modes/mode/lua'
import { nginx as nginxMode } from '@codemirror/legacy-modes/mode/nginx'
import { powerShell } from '@codemirror/legacy-modes/mode/powershell'
import { properties } from '@codemirror/legacy-modes/mode/properties'
import { r as rMode } from '@codemirror/legacy-modes/mode/r'
import { ruby as rubyMode } from '@codemirror/legacy-modes/mode/ruby'
import { sass as sassMode } from '@codemirror/legacy-modes/mode/sass'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { swift as swiftMode } from '@codemirror/legacy-modes/mode/swift'
import { toml as tomlMode } from '@codemirror/legacy-modes/mode/toml'

/**
 * The single place that knows how a SnippetBox language id maps onto a
 * CodeMirror grammar. Languages without a dedicated package fall back to a
 * stream parser; anything unknown renders as plain text rather than guessing.
 */
const stream = (parser: Parameters<typeof StreamLanguage.define>[0]): Extension => StreamLanguage.define(parser)

const LANGUAGE_LOADERS: Record<string, () => Extension | null> = {
  javascript: () => javascriptLanguage(),
  typescript: () => javascriptLanguage({ typescript: true }),
  jsx: () => javascriptLanguage({ jsx: true }),
  tsx: () => javascriptLanguage({ jsx: true, typescript: true }),
  python: () => pythonLanguage(),
  rust: () => rustLanguage(),
  go: () => goLanguage(),
  c: () => stream(c),
  cpp: () => cppLanguage(),
  csharp: () => stream(csharp),
  java: () => javaLanguage(),
  kotlin: () => stream(kotlin),
  swift: () => stream(swiftMode),
  php: () => phpLanguage(),
  ruby: () => stream(rubyMode),
  dart: () => stream(dart),
  objectivec: () => stream(objectiveC),
  r: () => stream(rMode),
  lua: () => stream(luaMode),
  bash: () => stream(shell),
  zsh: () => stream(shell),
  fish: () => stream(shell),
  powershell: () => stream(powerShell),
  sql: () => sqlLanguage(),
  html: () => htmlLanguage(),
  css: () => cssLanguage(),
  scss: () => stream(sassMode),
  json: () => jsonLanguage(),
  yaml: () => yamlLanguage(),
  toml: () => stream(tomlMode),
  ini: () => stream(properties),
  xml: () => xmlLanguage(),
  markdown: () => markdownLanguage(),
  dockerfile: () => stream(dockerFile),
  nginx: () => stream(nginxMode),
  diff: () => stream(diffMode),
  graphql: () => null,
  plaintext: () => null,
  other: () => null
}

const cache = new Map<string, Extension | null>()

/** `highlight` is the highlighter family from the shared language catalogue. */
export function languageExtension(highlight: string | null | undefined): Extension | null {
  const key = highlight ?? 'plaintext'
  if (cache.has(key)) return cache.get(key) ?? null

  const loader = LANGUAGE_LOADERS[key]
  let resolved: Extension | null = null

  try {
    resolved = loader ? loader() : null
  } catch {
    resolved = null
  }

  cache.set(key, resolved)
  return resolved
}

/**
 * Syntax colours are CSS variables, so switching themes repaints the editor
 * without rebuilding the view state.
 */
const highlightStyle = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--cm-comment)', fontStyle: 'italic' },
  {
    tag: [t.keyword, t.modifier, t.controlKeyword, t.moduleKeyword, t.operatorKeyword],
    color: 'var(--cm-keyword)'
  },
  { tag: [t.string, t.special(t.string), t.character], color: 'var(--cm-string)' },
  { tag: [t.number, t.integer, t.float], color: 'var(--cm-number)' },
  { tag: [t.bool, t.null, t.atom, t.constant(t.name)], color: 'var(--cm-bool)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName], color: 'var(--cm-function)' },
  { tag: [t.variableName, t.self, t.definition(t.variableName)], color: 'var(--cm-variable)' },
  { tag: [t.typeName, t.className, t.namespace, t.definition(t.typeName)], color: 'var(--cm-type)' },
  { tag: [t.propertyName], color: 'var(--cm-property)' },
  { tag: [t.tagName, t.angleBracket], color: 'var(--cm-tag)' },
  { tag: [t.attributeName, t.attributeValue], color: 'var(--cm-attribute)' },
  { tag: [t.operator], color: 'var(--cm-operator)' },
  { tag: [t.punctuation, t.separator, t.bracket, t.brace, t.squareBracket, t.paren], color: 'var(--cm-punctuation)' },
  { tag: [t.heading, t.strong], color: 'var(--cm-heading)', fontWeight: '600' },
  { tag: [t.link, t.url], color: 'var(--cm-link)', textDecoration: 'underline' },
  { tag: [t.meta, t.annotation, t.processingInstruction, t.documentMeta], color: 'var(--cm-meta)' },
  { tag: [t.invalid], color: 'var(--cm-invalid)' },
  { tag: [t.emphasis], fontStyle: 'italic' },
  { tag: [t.strikethrough], textDecoration: 'line-through' }
])

/**
 * All CodeMirror chrome lives in a real CM theme rather than in global.css.
 *
 * CodeMirror injects its own base theme into the document *after* the app's
 * stylesheet, so an equal-specificity `.cm-gutters` rule in CSS loses — that is
 * what left the line-number gutter light grey on the dark theme. Every selector
 * here carries an extra class via `&` so it also wins on specificity, whatever
 * order the two stylesheets end up in.
 */
const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'transparent',
    color: 'var(--text)'
  },
  '&.cm-focused': { outline: 'none' },

  '& .cm-scroller': {
    fontFamily: 'var(--code-font)',
    fontSize: 'var(--code-font-size)',
    lineHeight: '1.65',
    overflow: 'auto'
  },
  '& .cm-content': {
    fontFamily: 'inherit',
    caretColor: 'var(--cursor)',
    padding: '0.5rem 0'
  },
  '& .cm-line': { padding: '0 0.8rem' },

  /* Gutter — the part that was rendering as a light strip on the dark theme. */
  '& .cm-gutters': {
    backgroundColor: 'var(--code-gutter)',
    color: 'var(--text-subtle)',
    border: 'none',
    borderRight: '1px solid var(--border)',
    userSelect: 'none'
  },
  '& .cm-gutters-before': { borderRight: '1px solid var(--border)' },
  '& .cm-lineNumbers .cm-gutterElement': {
    padding: '0 0.55rem 0 0.65rem',
    minWidth: '1.4rem',
    textAlign: 'right'
  },
  '& .cm-foldGutter .cm-gutterElement': { padding: '0 0.3rem' },
  '& .cm-activeLineGutter': {
    backgroundColor: 'color-mix(in oklab, var(--primary) 12%, transparent)',
    color: 'var(--text-muted)'
  },
  '& .cm-activeLine': {
    backgroundColor: 'color-mix(in oklab, var(--primary) 7%, transparent)'
  },

  /* Caret and selection */
  '& .cm-cursor, & .cm-dropCursor': {
    borderLeftColor: 'var(--cursor)',
    borderLeftWidth: '2px'
  },
  '& .cm-selectionBackground': { backgroundColor: 'var(--selection)' },
  '&.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--selection)' },
  '& .cm-content ::selection': { backgroundColor: 'var(--selection)' },
  '& .cm-selectionMatch': {
    backgroundColor: 'color-mix(in oklab, var(--primary) 16%, transparent)'
  },
  '& .cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: 'color-mix(in oklab, var(--primary) 22%, transparent)',
    outline: '1px solid color-mix(in oklab, var(--primary) 45%, transparent)',
    color: 'inherit'
  },
  '& .cm-nonmatchingBracket': { color: 'var(--cm-invalid)' },
  '& .cm-foldPlaceholder': {
    backgroundColor: 'var(--surface-active)',
    border: 'none',
    color: 'var(--text-muted)',
    padding: '0 0.35rem',
    borderRadius: '4px'
  },

  /* Find and replace panel */
  '& .cm-panels': {
    backgroundColor: 'var(--surface-raised)',
    color: 'var(--text)',
    borderColor: 'var(--border)'
  },
  '& .cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
  '& .cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--border)' },
  '& .cm-panel': { padding: '0.35rem 0.6rem' },
  '& .cm-panel label': { color: 'var(--text-muted)', fontSize: 'inherit' },
  '& .cm-panel input, & .cm-panel button, & .cm-panel select': {
    backgroundColor: 'var(--surface)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '2px 7px',
    font: 'inherit',
    fontSize: '0.85em'
  },
  '& .cm-panel button:hover': { backgroundColor: 'var(--surface-hover)' },
  '& .cm-searchMatch': {
    backgroundColor: 'color-mix(in oklab, var(--warning) 32%, transparent)'
  },
  '& .cm-searchMatch-selected': {
    backgroundColor: 'color-mix(in oklab, var(--warning) 58%, transparent)'
  },

  /* Tooltips and autocomplete */
  '& .cm-tooltip': {
    backgroundColor: 'var(--surface-overlay)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-lg)',
    color: 'var(--text)',
    overflow: 'hidden'
  },
  '& .cm-tooltip-autocomplete > ul > li': { color: 'var(--text-secondary)' },
  '& .cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--primary)',
    color: 'var(--on-primary)'
  },
  '& .cm-completionMatchedText': {
    textDecoration: 'none',
    color: 'var(--primary)',
    fontWeight: '600'
  },
  '& .cm-placeholder': { color: 'var(--text-subtle)' },
  '& .cm-specialChar': { color: 'var(--cm-invalid)' }
})

/** Informs CodeMirror's own defaults which way the palette goes. */
export function darkThemeExtension(dark: boolean): Extension {
  return EditorView.darkTheme.of(dark)
}

/**
 * The static half of the editor: history, selection drawing, bracket matching,
 * autocompletion and the default keymap. Options that can change while the
 * editor is open are supplied separately so they can be reconfigured.
 */
export function baseEditorExtensions(options: { placeholder?: string } = {}): Extension[] {
  return [
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    autocompletion({ activateOnTyping: true, closeOnBlur: true }),
    rectangularSelection(),
    crosshairCursor(),
    highlightSelectionMatches(),
    search({ top: true }),
    syntaxHighlighting(highlightStyle, { fallback: true }),
    editorTheme,
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      indentWithTab
    ]),
    ...(options.placeholder ? [placeholderExtension(options.placeholder)] : [])
  ]
}

export function lineNumberExtensions(enabled: boolean): Extension[] {
  return enabled ? [lineNumbers(), highlightActiveLineGutter(), highlightActiveLine(), foldGutter()] : []
}

export function wrapExtensions(enabled: boolean): Extension[] {
  return enabled ? [EditorView.lineWrapping] : []
}

export function indentExtensions(tabSize: number): Extension[] {
  return [EditorState.tabSize.of(tabSize), indentUnit.of(' '.repeat(tabSize))]
}

export function readOnlyExtensions(readOnly: boolean): Extension[] {
  if (!readOnly) return [EditorState.readOnly.of(false), EditorView.editable.of(true)]

  return [EditorState.readOnly.of(true), EditorView.editable.of(false)]
}

/** A viewer has no caret; showing one invites typing that cannot happen. */
export function caretVisibilityExtension(visible: boolean): Extension {
  return EditorView.theme(visible ? {} : { '& .cm-cursor, & .cm-dropCursor': { display: 'none' } })
}

export function revealSearchPanel(view: EditorView): void {
  openSearchPanel(view)
}

export type { LanguageSupport }
