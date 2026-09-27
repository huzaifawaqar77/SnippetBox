/**
 * Focus handoff between React and non-React callers.
 *
 * Keyboard commands (from the native menu, the command palette, or a global
 * shortcut) need to move focus into the search box, which lives deep in the
 * component tree. A module-level handle is simpler and more predictable here
 * than threading refs through every layer.
 */
export const focusTargets: {
  search: HTMLInputElement | null
} = {
  search: null
}

export function focusSearch(): void {
  const input = focusTargets.search
  if (!input) return
  input.focus()
  input.select()
}

/** True when the user is typing, so single-key shortcuts must not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  if (element.isContentEditable) return true

  const tag = element.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true

  // CodeMirror renders a contenteditable inside .cm-editor.
  return Boolean(element.closest?.('.cm-editor'))
}

export function isOverlayOpen(): boolean {
  return Boolean(
    document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')
  )
}
