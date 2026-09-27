import { useEffect, useRef } from 'react'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { getLanguage } from '@shared/languages'
import { useIsDarkTheme } from '../hooks'
import {
  baseEditorExtensions,
  caretVisibilityExtension,
  darkThemeExtension,
  indentExtensions,
  languageExtension,
  lineNumberExtensions,
  readOnlyExtensions,
  wrapExtensions
} from '../lib/codemirror'
import { cn } from '../lib/utils'

export interface CodeMirrorEditorProps {
  value: string
  language: string
  onChange?: (value: string) => void
  readOnly?: boolean
  showLineNumbers?: boolean
  wordWrap?: boolean
  tabSize?: number
  placeholder?: string
  className?: string
  onReady?: (view: EditorView) => void
  onFocus?: () => void
  ariaLabel?: string
}

/**
 * The single code surface in the app — used read-only for viewing and
 * editable for writing, so highlighting never differs between the two.
 *
 * The view is created once; option changes are applied through compartments so
 * the document, undo history and scroll position survive re-renders.
 */
export function CodeMirrorEditor({
  value,
  language,
  onChange,
  readOnly = false,
  showLineNumbers = true,
  wordWrap = false,
  tabSize = 2,
  placeholder,
  className,
  onReady,
  onFocus,
  ariaLabel
}: CodeMirrorEditorProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onFocusRef = useRef(onFocus)
  const initialValue = useRef(value)
  const isDark = useIsDarkTheme()

  const compartments = useRef({
    language: new Compartment(),
    lines: new Compartment(),
    wrap: new Compartment(),
    indent: new Compartment(),
    readOnly: new Compartment(),
    caret: new Compartment(),
    dark: new Compartment(),
    attributes: new Compartment()
  })

  onChangeRef.current = onChange
  onFocusRef.current = onFocus

  const highlight = getLanguage(language)?.highlight ?? 'plaintext'

  // Create the view exactly once.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const parts = compartments.current

    const state = EditorState.create({
      doc: initialValue.current,
      extensions: [
        ...baseEditorExtensions(placeholder ? { placeholder } : {}),
        parts.language.of(languageExtension(highlight) ?? []),
        parts.lines.of(lineNumberExtensions(showLineNumbers)),
        parts.wrap.of(wrapExtensions(wordWrap)),
        parts.indent.of(indentExtensions(tabSize)),
        parts.readOnly.of(readOnlyExtensions(readOnly)),
        parts.caret.of(caretVisibilityExtension(!readOnly)),
        parts.dark.of(darkThemeExtension(isDark)),
        parts.attributes.of(EditorView.contentAttributes.of({ 'aria-label': ariaLabel ?? 'Code' })),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current?.(update.state.doc.toString())
        }),
        EditorView.domEventHandlers({
          focus: () => {
            onFocusRef.current?.()
            return false
          }
        })
      ]
    })

    const view = new EditorView({ state, parent: host })
    viewRef.current = view
    onReady?.(view)

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Deliberately created once: option changes go through compartments below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: compartments.current.language.reconfigure(languageExtension(highlight) ?? [])
    })
  }, [highlight])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: compartments.current.lines.reconfigure(lineNumberExtensions(showLineNumbers)) })
  }, [showLineNumbers])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: compartments.current.wrap.reconfigure(wrapExtensions(wordWrap)) })
  }, [wordWrap])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: compartments.current.indent.reconfigure(indentExtensions(tabSize)) })
  }, [tabSize])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: compartments.current.readOnly.reconfigure(readOnlyExtensions(readOnly)) })
    viewRef.current?.dispatch({
      effects: compartments.current.caret.reconfigure(caretVisibilityExtension(!readOnly))
    })
  }, [readOnly])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: compartments.current.dark.reconfigure(darkThemeExtension(isDark)) })
  }, [isDark])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: compartments.current.attributes.reconfigure(
        EditorView.contentAttributes.of({ 'aria-label': ariaLabel ?? 'Code' })
      )
    })
  }, [ariaLabel])

  // Push external document changes (a different snippet, a restored version).
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
  }, [value])

  return (
    <div
      ref={hostRef}
      data-selectable
      className={cn('h-full min-h-0 w-full overflow-hidden bg-code', className)}
    />
  )
}
