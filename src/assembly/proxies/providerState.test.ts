import {
  ProviderHealthState,
  ProviderListSchema,
  ProviderServiceCapability,
  ProviderServiceInfoSchema,
} from '@/gen/daemon/provider_service_pb'
import type { Proxy } from '@/types'
import { create } from '@bufbuild/protobuf'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mergeProviderProxyNodes,
  ProviderSnapshotState,
  waitForCommittedProviderRevision,
} from './providerState'

const serviceInfo = (...capabilities: ProviderServiceCapability[]) =>
  create(ProviderServiceInfoSchema, { protocolVersion: 1, capabilities })

const snapshot = (
  instanceId: string,
  revision: bigint,
  nodes: string[],
  capabilities = { canRefresh: true, canHealthCheck: true },
) =>
  create(ProviderListSchema, {
    instanceId,
    revision,
    providers: [
      {
        tag: 'provider',
        type: 'remote',
        updatedAtMs: 1000n,
        capabilities: { ...capabilities, hasSubscriptionInfo: true },
        subscription: {
          uploadBytes: 1n,
          downloadBytes: 2n,
          totalBytes: 3n,
          expireAtSeconds: 4n,
        },
        nodes: nodes.map((tag) => ({
          tag,
          type: 'shadowsocks',
          networks: ['tcp', 'udp'],
          health: {
            state: ProviderHealthState.REACHABLE,
            delayMs: 20,
            checkedAtMs: 2000n,
          },
        })),
      },
    ],
  })

const startedProxy = (name: string): Proxy => ({
  name,
  type: 'selector',
  history: [],
  extra: {},
  now: '',
  icon: '',
})

describe('ProviderSnapshotState', () => {
  let state: ProviderSnapshotState

  beforeEach(() => {
    state = new ProviderSnapshotState()
    state.setServiceInfo(
      serviceInfo(
        ProviderServiceCapability.LIST,
        ProviderServiceCapability.SUBSCRIBE,
        ProviderServiceCapability.REFRESH,
      ),
    )
  })

  it('intersects service and Provider capabilities', () => {
    state.apply(snapshot('instance', 1n, ['node']))

    expect(state.providers[0]).toMatchObject({
      canRefresh: true,
      canHealthCheck: false,
      subscriptionInfo: { Upload: 1, Download: 2, Total: 3, Expire: 4 },
    })
  })

  it('replaces an instance even when its revision is lower', async () => {
    state.apply(snapshot('old-instance', 10n, ['old']))
    const oldRevision = expect(state.waitForRevision('old-instance', 11n)).rejects.toThrow(
      'instance changed',
    )

    expect(state.apply(snapshot('new-instance', 1n, ['new']))).toBe(true)
    await oldRevision
    expect(state.nodes).not.toHaveProperty('old')
    expect(state.nodes).toHaveProperty('new')
  })

  it('coalesces duplicate and out-of-order revisions', () => {
    expect(state.apply(snapshot('instance', 2n, ['current']))).toBe(true)
    expect(state.apply(snapshot('instance', 1n, ['stale']))).toBe(false)
    expect(state.apply(snapshot('instance', 2n, ['duplicate']))).toBe(false)

    expect(state.nodes).toHaveProperty('current')
    expect(state.nodes).not.toHaveProperty('stale')
    expect(state.nodes).not.toHaveProperty('duplicate')
  })

  it('removes stale Provider nodes without deleting StartedService nodes', () => {
    state.apply(snapshot('instance', 1n, ['stale', 'shared']))
    state.apply(snapshot('instance', 2n, ['current']))

    const merged = mergeProviderProxyNodes(state.nodes, {
      shared: startedProxy('shared'),
      started: startedProxy('started'),
    })

    expect(merged).not.toHaveProperty('stale')
    expect(merged).toHaveProperty('current')
    expect(merged).toHaveProperty('started')
    expect(merged.shared.type).toBe('selector')
    expect(merged.shared).not.toHaveProperty('provider-name')
  })

  it('resolves actions only after their committed revision is observed', async () => {
    state.apply(snapshot('instance', 1n, ['old']))
    const listProviders = vi.fn(async () => snapshot('instance', 2n, ['new']))
    let resolved = false
    const waiting = waitForCommittedProviderRevision(
      state,
      'instance',
      2n,
      listProviders,
      1000,
    ).then(() => {
      resolved = true
    })

    await Promise.resolve()
    expect(resolved).toBe(false)
    state.apply(snapshot('instance', 2n, ['new']))
    await waiting

    expect(resolved).toBe(true)
    expect(listProviders).not.toHaveBeenCalled()
  })

  it('clears Provider state and pending revisions on reset', async () => {
    state.apply(snapshot('instance', 1n, ['node']))
    const pending = expect(state.waitForRevision('instance', 2n)).rejects.toThrow('session reset')

    state.reset()
    await pending

    expect(state.providers).toEqual([])
    expect(state.nodes).toEqual({})
  })
})
