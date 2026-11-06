// Release gate: freshly built dist + real Chrome + the pinned released sing-box.
// SING_BOX_BINARY=/path/to/sing-box node test/singbox.mjs
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { connectBrowser, waitFor } from './lib/cdp.mjs'
import { launchChrome } from './lib/chrome.mjs'
import { findFreePort } from './lib/ports.mjs'
import { serveDirectory } from './lib/static-server.mjs'
import { startSingbox, GROUPS, NODES, PROVIDER } from './lib/singbox.mjs'

let fixture, assets, chrome, browser, page
const quote = JSON.stringify
const groupSelector = (name) => `[data-group-name=${quote(name)}]`
const screenSelector = (name) => `${groupSelector(name)} button[aria-label="Rescreen"]`
const until = async (label, condition) => {
  if (await waitFor(condition, { timeout: 30000, interval: 50 }) === null) {
    throw new Error(`Timed out: ${label}`)
  }
}
const ui = (expression) => until(expression, () => page.evaluate(expression))
const click = async (selector) => {
  await ui(`Boolean(document.querySelector(${quote(selector)}))`)
  // Moving away also lets a hovered copy-success toast expire normally.
  await page.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 })
  let box
  await until(`unobscured control: ${selector}`, async () => {
    box = await page.evaluate(`(() => {
      const element = document.querySelector(${quote(selector)});
      if (!element || element.disabled) return null;
      element.scrollIntoView({ block: 'center' });
      const bounds = element.getBoundingClientRect();
      const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      return bounds.width > 0 && bounds.height > 0 && element.contains(document.elementFromPoint(point.x, point.y)) ? point : null;
    })()`)
    return Boolean(box)
  })
  await page.click(box.x, box.y)
}
const readNode = (group, name) => page.evaluate(`(() => {
  const group = document.querySelector(${quote(groupSelector(group))});
  const name = [...(group?.querySelectorAll('.collapse-motion-content span') || [])]
    .find((element) => element.textContent === ${quote(name)});
  const card = name?.closest('.cursor-pointer');
  return card ? { text: card.innerText, active: card.classList.contains('proxy-active-card') } : null;
})()`)
const nodeHas = (group, name, status) => until(`${group}/${name}: ${status}`, async () =>
  (await readNode(group, name))?.text.includes(status))

try {
  fixture = await startSingbox()
  await until('initial probe generation completes', () => GROUPS.every((tag) => {
    const group = fixture.group(tag)
    return group?.probe && !group.probe.running && group.probe.generation > 0n
  }))
  assets = await serveDirectory(join(import.meta.dirname, '..', 'dist'))
  const port = await findFreePort()
  chrome = await launchChrome({ port, args: ['--lang=en-US', '--accept-lang=en-US'] })
  browser = await connectBrowser(port)
  page = await browser.newPage({ width: 1600, height: 1200 })
  const backend = {
    uuid: 'native-ci', type: 'singbox', protocol: 'http', host: '127.0.0.1',
    port: String(fixture.apiPort), password: '', secondaryPath: '', label: 'Native CI',
  }
  const settings = {
    'setup/api-list': JSON.stringify([backend]), 'setup/active-uuid': backend.uuid,
    'config/language': 'en-US', 'config/two-columns': 'false',
    'cache/collapse-group-map': JSON.stringify(Object.fromEntries([...GROUPS, PROVIDER].map((name) => [name, true]))),
  }
  await page.call('Page.addScriptToEvaluateOnNewDocument', { source: `
    ${Object.entries(settings).map(([key, value]) => `localStorage.setItem(${quote(key)}, ${quote(value)});`).join('\n')}
    window.__nativeErrors = [];
    addEventListener('error', (event) => window.__nativeErrors.push(event.message));
    addEventListener('unhandledrejection', (event) => window.__nativeErrors.push(String(event.reason)));
  ` })
  await page.goto(`${assets.url}/#/proxies`)
  await nodeHas(GROUPS[0], NODES[0], 'Passed')
  await nodeHas(GROUPS[1], NODES[0], 'Passed')
  await nodeHas(GROUPS[2], NODES[0], 'Disqualified')
  await nodeHas(GROUPS[3], NODES[0], 'Not checked')
  await nodeHas(GROUPS[3], NODES[1], 'Passed')
  assert.equal(fixture.group(GROUPS[2]).items.find((item) => item.tag === NODES[0]).probe.ok, false)
  assert.ok(fixture.group(GROUPS[2]).items.find((item) => item.tag === NODES[0]).probe.error)
  assert.equal(fixture.group(GROUPS[3]).items.find((item) => item.tag === NODES[0]).probe, undefined)
  console.log('✓ Real core reports: same node passed / explicitly failed / unchecked in separate groups')

  const current = fixture.group(GROUPS[0]).selected
  assert.ok(NODES.includes(current))
  assert.equal(fixture.group(GROUPS[0]).items.find((item) => item.tag === current).probe.ok, true)
  await until('current passing member highlighted', async () => (await readNode(GROUPS[0], current))?.active)
  const previous = fixture.group(GROUPS[0]).probe.generation
  const historyStart = fixture.state.history.length
  fixture.hold()
  await click(screenSelector(GROUPS[0]))
  await until('core publishes probe start', () => fixture.group(GROUPS[0]).probe.running)
  await ui(`(() => { const button = document.querySelector(${quote(screenSelector(GROUPS[0]))}); return button?.disabled && button.innerText.includes('Screening') && Boolean(button.querySelector('.loading')); })()`)
  fixture.release()
  await until('new generation completes', () => {
    const probe = fixture.group(GROUPS[0]).probe
    return !probe.running && probe.generation > previous && probe.screenedAt > 0n
  })
  await ui(`(() => { const button = document.querySelector(${quote(screenSelector(GROUPS[0]))}); return button && !button.disabled && button.innerText === 'Rescreen' && !button.querySelector('.loading'); })()`)
  assert.ok(fixture.state.history.slice(historyStart).some((groups) => groups.find((group) => group.tag === GROUPS[0])?.probe.running))
  assert.equal(fixture.group(GROUPS[0]).selected, current)
  await until('passing current member stays selected in UI', async () => (await readNode(GROUPS[0], current))?.active)
  await nodeHas(GROUPS[1], NODES[0], 'Passed')
  await nodeHas(GROUPS[2], NODES[0], 'Disqualified')
  await nodeHas(GROUPS[3], NODES[0], 'Not checked')
  console.log('✓ Rescreen: running → greater completed generation; passing current member retained')

  await click('[role="tab"][data-value="proxyProvider"]')
  await ui(`Boolean(document.querySelector('button[aria-label="Show subscription URL"]'))`)
  // Only the synthetic subscription URL is ever present; diagnostics redact it too.
  assert.equal(await page.evaluate(`document.body.innerText.includes(${quote(fixture.subscriptionURL)})`), false)
  await ui(`document.body.innerText.toLowerCase().includes('remote · 0/1') && document.body.innerText.includes('1 MiB / 10 MiB')`)
  await click('button[aria-label="Show subscription URL"]')
  await ui(`document.body.innerText.includes(${quote(fixture.subscriptionURL)}) && Boolean(document.querySelector('button[aria-label="Hide subscription URL"]'))`)
  await page.call('Browser.grantPermissions', { origin: assets.url, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] })
  await click('button[aria-label="Copy"]')
  await until('real system clipboard matches subscription URL', async () =>
    await page.evaluate('navigator.clipboard.readText()') === fixture.subscriptionURL)
  await click('button[aria-label="Hide subscription URL"]')
  await ui(`!document.body.innerText.includes(${quote(fixture.subscriptionURL)}) && Boolean(document.querySelector('button[aria-label="Show subscription URL"]'))`)
  console.log('✓ Remote subscription URL: hidden → shown → real clipboard copy → hidden')

  const oldRequests = fixture.state.requests
  fixture.state.revision = 2
  await click('.collapse-motion-header button[aria-label="Refresh"]')
  await until('real remote subscription fetched again', () => fixture.state.requests > oldRequests)
  await ui(`document.body.innerText.toLowerCase().includes('remote · 0/2') && document.body.innerText.includes('ci-remote-1') && document.body.innerText.includes('ci-remote-2') && document.body.innerText.includes('2 MiB / 10 MiB')`)
  assert.equal(await page.evaluate(`document.body.innerText.includes(${quote(fixture.subscriptionURL)})`), false)
  assert.deepEqual(await page.evaluate('window.__nativeErrors'), [])
  assert.equal(fixture.state.streamError, null)
  console.log('✓ Provider refresh: real subscription changes to two nodes and updated usage in UI')
} catch (error) {
  const redact = (text) => String(text).replaceAll(fixture?.subscriptionURL || '__no_subscription__', '[subscription URL]')
  const body = page ? await page.evaluate('document.body.innerText').catch(() => '(page unavailable)') : '(no page)'
  console.error(redact(`Native release gate failed: ${error.stack}\nUI: ${body}\nCore: ${fixture?.diagnostics() || '(not started)'}`))
  process.exitCode = 1
} finally {
  // Every resource created successfully above is closed, including failures midway through startup.
  for (const cleanup of [
    () => page?.close(), () => browser?.close(), () => chrome?.close(),
    () => assets?.close(), () => fixture?.close(),
  ]) {
    try { await cleanup() } catch (error) {
      console.error('Native release gate cleanup failed:', error.message)
      process.exitCode = 1
    }
  }
}
