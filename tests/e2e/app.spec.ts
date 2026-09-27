import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

/**
 * End-to-end coverage for the critical flows in section 87 of the product spec:
 * create → find → copy → favorite → edit → trash → restore, plus backup, export,
 * settings layout and zoom.
 *
 * Each run gets its own data directory, so tests never touch a real library.
 * Run with `npm run build && npm run test:e2e`.
 *
 * Note: Playwright's synthetic key events reach the renderer but not Chromium's
 * native menu accelerators, so menu-driven commands are invoked through the real
 * menu via `clickMenuItem` — which also exercises the menu→renderer wiring.
 */

let app: ElectronApplication
let page: Page
let workDir: string

/**
 * Extra Chromium switches, opt-in via the environment. CI containers that cannot
 * use Chromium's SUID sandbox can pass `SNIPPETBOX_E2E_ARGS=--no-sandbox`; the
 * default is the sandboxed app, exactly as users run it.
 */
const extraArgs = (process.env.SNIPPETBOX_E2E_ARGS ?? '').split(' ').filter(Boolean)

test.beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), 'snippetbox-e2e-'))
  const configHome = join(workDir, 'config')
  const configDir = join(configHome, 'snippetbox')
  const dataHome = join(workDir, 'data')
  const dataDir = join(dataHome, 'snippetbox')

  // Skip onboarding so the tests start in the workspace, deterministically.
  mkdirSync(configDir, { recursive: true })
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(
    join(configDir, 'settings.json'),
    JSON.stringify({
      onboardingComplete: true,
      theme: 'dark',
      dataLocation: dataDir,
      backupLocation: join(dataDir, 'backups')
    })
  )

  app = await electron.launch({
    args: ['.', ...extraArgs],
    cwd: process.cwd(),
    env: { ...process.env, XDG_CONFIG_HOME: configHome, XDG_DATA_HOME: dataHome }
  })

  // Surface main-process output: a silent failure here is very hard to diagnose.
  app.process().stdout?.on('data', (chunk) => process.stdout.write(`[main] ${chunk}`))
  app.process().stderr?.on('data', (chunk) => {
    const text = String(chunk)
    if (!/libva|GPU|dbus|Fontconfig|gbm|Vulkan|DevTools listening/i.test(text)) {
      process.stderr.write(`[main] ${text}`)
    }
  })

  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByRole('listbox')).toBeVisible()
})

test.afterAll(async () => {
  await app?.close()
  // Set SNIPPETBOX_E2E_KEEP=1 to inspect the data directory afterwards.
  if (process.env.SNIPPETBOX_E2E_KEEP !== '1') rmSync(workDir, { recursive: true, force: true })
  else console.log(`kept test data in ${workDir}`)
})

/** Counts what the app itself reports, for assertions and diagnostics. */
async function libraryCount(): Promise<number> {
  const raw = await page.evaluate(async () => {
    const result = await window.snippetbox.snippets.list({ view: 'all' })
    return JSON.stringify({ total: result.total, items: result.items.length })
  })
  return JSON.parse(raw).total
}

/** Clicks a real application-menu item by label, by reaching into the main process. */
async function clickMenuItem(label: string): Promise<void> {
  await app.evaluate(({ Menu }, target) => {
    const search = (items: Electron.MenuItem[]): Electron.MenuItem | null => {
      for (const item of items) {
        if (item.label === target) return item
        const nested = item.submenu ? search(item.submenu.items) : null
        if (nested) return nested
      }
      return null
    }
    const item = search(Menu.getApplicationMenu()?.items ?? [])
    if (!item) throw new Error(`Menu item not found: ${target}`)
    item.click()
  }, label)
}

/** The sidebar's own "New snippet" button — the detail pane has one too. */
function sidebarNewSnippet() {
  return page.locator('nav[aria-label="Library"] button[aria-label="New snippet"]')
}

async function createSnippet(title: string, code: string): Promise<void> {
  await sidebarNewSnippet().click()
  await page.getByLabel('Title').fill(title)
  await page.getByLabel('Snippet code').fill(code)
  await page.getByRole('button', { name: /save snippet/i }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}

test('the three-pane workspace renders with a 18px default interface size', async () => {
  await expect(page.getByRole('navigation', { name: 'Library' })).toBeVisible()
  await expect(page.getByRole('searchbox', { name: 'Search snippets' })).toBeVisible()
  await expect(page.getByRole('listbox')).toBeVisible()

  const rootFontSize = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)
  expect(rootFontSize).toBe('18px')
})

test('flow 1 — create a snippet and see it in the list', async () => {
  await createSnippet('Check if a port is in use', '#!/bin/bash\nlsof -i :8080')
  await expect(page.getByRole('option', { name: /check if a port is in use/i })).toBeVisible()
  expect(await libraryCount()).toBe(1)
})

test('flow 2 — search, open and copy', async () => {
  const search = page.getByRole('searchbox', { name: 'Search snippets' })
  await search.fill('port')

  await page.getByRole('option', { name: /check if a port is in use/i }).click()
  await expect(page.getByRole('heading', { name: 'Check if a port is in use' })).toBeVisible()

  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Copied!', exact: true })).toBeVisible()
})

test('flow 3 — favoriting puts a snippet in Favorites', async () => {
  expect(await libraryCount()).toBe(1)

  // Scoped to the detail pane: each list row also has a favourite star.
  const detail = page.locator('[data-detail-pane]')
  await detail.getByRole('button', { name: 'Add to favorites' }).click()

  await page.getByRole('button', { name: /^Favorites/ }).click()
  await expect(page.getByRole('option', { name: /check if a port is in use/i })).toBeVisible()

  await page.getByRole('button', { name: /^All Snippets/ }).click()
})

test('flow 4 — editing autosaves', async () => {
  expect(await libraryCount()).toBe(1)

  await page.locator('[data-detail-pane]').getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('Description').fill('A description written by the end-to-end suite.')

  // The autosave indicator must settle rather than staying on "Saving…".
  await expect(page.getByText('Saved')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByText('A description written by the end-to-end suite.')).toBeVisible()
  expect(await libraryCount()).toBe(1)
})

test('flow 5 — trash a snippet and restore it', async () => {
  expect(await libraryCount()).toBe(1)

  const detail = page.locator('[data-detail-pane]')
  await detail.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Move to Trash' }).click()

  // Scope to the dialog: the menu item that opened it has the same label.
  const confirm = page.getByRole('alertdialog')
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Move to Trash' }).click()

  await page.getByRole('button', { name: /^Trash/ }).click()
  const trashed = page.getByRole('option', { name: /check if a port is in use/i })
  await expect(trashed).toBeVisible()

  // A trashed snippet is hidden from the normal views but still in the database.
  expect(await libraryCount()).toBe(0)

  await trashed.click({ button: 'right' })
  const contextMenu = page.getByRole('menu')
  await expect(contextMenu).toBeVisible()
  // Wait for the item itself, not just the container: Radix mounts the list and
  // its items a frame apart, which occasionally raced the click.
  const restoreItem = page.getByRole('menuitem', { name: 'Restore' })
  await expect(restoreItem).toBeVisible()
  await restoreItem.click()

  await page.getByRole('button', { name: /^All Snippets/ }).click()
  await expect(page.getByRole('option', { name: /check if a port is in use/i })).toBeVisible()
  expect(await libraryCount()).toBe(1)
})

test('the command palette opens through the real application menu', async () => {
  await clickMenuItem('Command Palette')
  await expect(page.getByPlaceholder('Type a command…')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByPlaceholder('Type a command…')).toBeHidden()
})

test('settings open with every section, inset from the dialog edges', async () => {
  await page.getByRole('button', { name: 'Settings' }).click()

  for (const section of ['General', 'Appearance', 'Editor', 'Storage', 'Privacy', 'About']) {
    await expect(page.getByRole('button', { name: section, exact: true })).toBeVisible()
  }

  // Regression guard: the body must not add padding while the inner layout also
  // applies a negative margin — that combination jammed content against the
  // dialog borders and clipped it.
  const geometry = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    const body = dialog.children[1] as HTMLElement
    const nav = dialog.querySelector('nav[aria-label="Settings sections"]') as HTMLElement
    const content = nav.parentElement!.lastElementChild as HTMLElement
    const heading = content.querySelector('h1, h2, h3') as HTMLElement

    const rect = (element: HTMLElement) => element.getBoundingClientRect()

    return {
      bodyPaddingLeft: Number.parseFloat(getComputedStyle(body).paddingLeft),
      navOffsetFromDialogLeft: Math.round(rect(nav).left - rect(dialog).left),
      contentGapFromDialogRight: Math.round(rect(dialog).right - rect(content).right),
      headingInset: Math.round(rect(heading).left - rect(content).left),
      bodyOverflowWidth: body.scrollWidth - body.clientWidth
    }
  })

  expect(geometry.bodyPaddingLeft).toBe(0)
  expect(geometry.navOffsetFromDialogLeft).toBeLessThanOrEqual(2)
  expect(geometry.contentGapFromDialogRight).toBeLessThanOrEqual(2)
  expect(geometry.headingInset).toBeGreaterThan(8)
  expect(geometry.bodyOverflowWidth).toBe(0)

  await page.keyboard.press('Escape')
})

test('zooming via the sidebar control scales the whole interface and persists', async () => {
  const readout = page.locator('nav[aria-label="Library"] [aria-label^="Zoom level"]')
  const zoomIn = page.locator('nav[aria-label="Library"] button[aria-label="Zoom in"]')

  await expect(readout).toHaveText('100%')
  const before = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)

  await zoomIn.click()
  await zoomIn.click()
  await expect(readout).toHaveText('111%')

  const after = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)
  expect(Number.parseFloat(after)).toBeGreaterThan(Number.parseFloat(before))

  // Panels scale with zoom, so the layout stays proportional.
  const sidebarWidth = await page.evaluate(
    () => document.querySelector('nav[aria-label="Library"]')!.getBoundingClientRect().width
  )
  expect(sidebarWidth).toBeGreaterThan(260)

  // Clicking the percentage resets to 100%.
  await readout.click()
  await expect(readout).toHaveText('100%')
})

test('flow 6 — a backup can be created from settings', async () => {
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Storage', exact: true }).click()
  await page.getByRole('button', { name: /create backup/i }).click()

  await expect(page.getByText('Backup created')).toBeVisible({ timeout: 15_000 })
  await page.keyboard.press('Escape')
})

test('flow 7 — the export dialog offers every format', async () => {
  await clickMenuItem('Export…')

  // Anchored names: the archive description also mentions "metadata.json".
  await expect(page.getByRole('radio', { name: /^JSON/ })).toBeVisible()
  await expect(page.getByRole('radio', { name: /^Archive/ })).toBeVisible()
  await expect(page.getByRole('radio', { name: /^Markdown folder/ })).toBeVisible()

  await page.getByRole('button', { name: 'Cancel' }).click()
})

test('the empty state is honest when a search finds nothing', async () => {
  await page.getByRole('searchbox', { name: 'Search snippets' }).fill('zzz-nothing-matches-this')
  await expect(page.getByText('No snippets found.')).toBeVisible()
})
