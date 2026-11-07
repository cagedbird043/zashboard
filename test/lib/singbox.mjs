// Real core fixture: loopback-only HTTP, no TUN, external subscriptions, or DNS.
import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { createClient } from '@connectrpc/connect'
import { createGrpcWebTransport } from '@connectrpc/connect-web'
import ts from 'typescript'
import { findFreePort } from './ports.mjs'
import { sleep, waitFor } from './cdp.mjs'

// Reuse the checked-in protobuf descriptor without maintaining a second wire schema.
const source = await readFile(new URL('../../src/gen/daemon/started_service_pb.ts', import.meta.url), 'utf8')
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/from "(@bufbuild\/protobuf[^\"]*)"/g, (_, name) => `from ${JSON.stringify(import.meta.resolve(name))}`)
const { StartedService } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`)

export const GROUPS = ['CI Download', 'CI Request Pass', 'CI Request Fail', 'CI Ordered']
export const NODES = ['ci-direct-a', 'ci-direct-b']
export const PROVIDER = 'CI Remote'

export const startSingbox = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'zashboard-singbox-'))
  let core, server, streamTask
  const controller = new AbortController()
  const state = { revision: 1, requests: 0, gate: null, groups: [], history: [], streamError: null, logs: '' }
  const release = () => { state.gate?.resolve(); state.gate = null }
  const close = async () => {
    release()
    controller.abort()
    if (core && core.exitCode === null && core.signalCode === null) {
      const exited = once(core, 'exit')
      core.kill('SIGTERM')
      const timer = setTimeout(() => core.kill('SIGKILL'), 3000)
      try { await exited } finally { clearTimeout(timer) }
    }
    await streamTask
    if (server) {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
    await rm(directory, { recursive: true, force: true })
  }
  try {
    const binary = process.env.SING_BOX_BINARY || execFileSync('bash', [
      new URL('../../scripts/ci/download-sing-box.sh', import.meta.url).pathname,
      join(directory, 'binary'),
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()
    server = createServer(async (request, response) => {
      try {
        if (request.url.startsWith('/subscription')) {
          state.requests++
          response.writeHead(200, {
            'content-type': 'application/json',
            'subscription-userinfo': `upload=0; download=${state.revision * 1048576}; total=10485760; expire=2000000000`,
          })
          response.end(JSON.stringify({ outbounds: Array.from({ length: state.revision }, (_, index) => ({
            type: 'shadowsocks', tag: `ci-remote-${index + 1}`, server: '127.0.0.1',
            server_port: server.address().port, method: 'aes-128-gcm', password: 'synthetic-fixture',
          })) }))
          return
        }
        // A gate makes the running state observable without relying on timing.
        if (state.gate) await state.gate.promise
        await sleep(60)
        if (response.destroyed) return
        response.writeHead(200, { 'content-length': 131072, 'content-type': 'application/octet-stream' })
        response.write(Buffer.alloc(65536))
        await sleep(5)
        response.end(Buffer.alloc(65536))
      } catch (error) { response.destroy(error) }
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${server.address().port}`
    const apiPort = await findFreePort()
    const failedPort = await findFreePort()
    const subscriptionURL = `${origin}/subscription?token=synthetic-ci-only`
    const config = {
      log: { level: 'warn', timestamp: false },
      http_clients: [{ tag: 'subscription-http' }],
      providers: [{ type: 'remote', tag: PROVIDER, url: subscriptionURL, http_client: 'subscription-http', update_interval: '24h' }],
      outbounds: [
        ...NODES.map((tag) => ({ type: 'direct', tag })),
        { type: 'probe', tag: GROUPS[0], probe: 'ci-probe', policy: 'bulk', outbounds: NODES },
        { type: 'probe', tag: GROUPS[1], probe: 'ci-probe', policy: 'request', outbounds: NODES },
        { type: 'probe', tag: GROUPS[2], probe: 'ci-probe', policy: 'unreachable', outbounds: NODES },
        { type: 'probe', tag: GROUPS[3], probe: 'ci-probe', policy: 'ordered', outbounds: [NODES[1], NODES[0]] },
        { type: 'selector', tag: 'CI Subscription', providers: [PROVIDER] },
      ],
      route: { final: NODES[0] },
      services: [
        { type: 'api', tag: 'ci-api', listen: '127.0.0.1', listen_port: apiPort, access_control_allow_private_network: true },
        {
          type: 'node-probe', tag: 'ci-probe',
          domestic: { url: `${origin}/domestic`, bytes: 131072 },
          measures: {
            bulk: { kind: 'download', targets: [`${origin}/download`], bytes: 131072, timeout: '5s' },
            request: { kind: 'request', targets: [`${origin}/request`], timeout: '5s' },
            unreachable: { kind: 'request', targets: [`http://127.0.0.1:${failedPort}/unreachable`], timeout: '5s' },
            ordered: { kind: 'request', targets: [`${origin}/ordered`], timeout: '5s' },
          },
          policies: {
            bulk: { screen: { measures: ['bulk'], interval: '24h' }, qualify: 'm.bulk.last_ok', score: 'm.bulk.total.p50' },
            request: { screen: { measures: ['request'], interval: '24h' }, qualify: 'm.request.last_ok', score: 'm.request.first_byte.p50' },
            unreachable: { screen: { measures: ['unreachable'], interval: '24h' }, qualify: 'm.unreachable.last_ok' },
            // Only the first member takes part, so the other shows as not eligible.
            ordered: { screen: { measures: ['ordered'], interval: '24h' }, eligible: 'node.index == 0', qualify: 'm.ordered.last_ok' },
          },
        },
      ],
    }
    const configPath = join(directory, 'config.json')
    await writeFile(configPath, JSON.stringify(config))
    core = spawn(binary, ['run', '-c', configPath, '-D', directory], { stdio: ['ignore', 'pipe', 'pipe'] })
    core.on('error', (error) => { state.logs += error.message })
    for (const output of [core.stdout, core.stderr]) output.on('data', (chunk) => { state.logs = (state.logs + chunk).slice(-12000) })
    const client = createClient(StartedService, createGrpcWebTransport({ baseUrl: `http://127.0.0.1:${apiPort}` }))
    const ready = await waitFor(async () => {
      if (core.exitCode !== null) throw new Error(`Core exited: ${state.logs}`)
      try { return Boolean(await client.getVersion({}, { timeoutMs: 500 })) } catch { return false }
    })
    if (ready === null) throw new Error(`Core did not start: ${state.logs}`)
    streamTask = (async () => {
      try {
        for await (const update of client.subscribeGroups({}, { signal: controller.signal })) {
          state.groups = update.group
          state.history.push(update.group)
        }
      } catch (error) { if (!controller.signal.aborted) state.streamError = String(error) }
    })()
    return {
      state, apiPort, subscriptionURL, client,
      group: (name) => state.groups.find((group) => group.tag === name),
      hold() {
        if (state.gate) throw new Error('Probe gate is already held')
        let resolve
        const promise = new Promise((done) => { resolve = done })
        state.gate = { promise, resolve }
      },
      release, close,
      diagnostics() {
        return JSON.stringify({
          groups: state.groups, streamError: state.streamError,
          core: { exitCode: core.exitCode, signalCode: core.signalCode },
          logs: state.logs.replaceAll(subscriptionURL, '[subscription URL]'),
        }, (_, value) => typeof value === 'bigint' ? value.toString() : value)
      },
    }
  } catch (error) {
    await close()
    throw error
  }
}
