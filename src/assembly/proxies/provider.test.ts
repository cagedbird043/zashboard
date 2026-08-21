/* @vitest-environment happy-dom */
import type * as VueUse from '@vueuse/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const clashActions = vi.hoisted(() => ({
  refreshProxyProvider: vi.fn(),
  healthCheckProxyProvider: vi.fn(),
}))

vi.mock('@/assembly/backend', () => ({
  can: () => false,
  Channel: { Clash: 'clash', Singbox: 'singbox' },
  channel: { value: 'clash' },
}))

vi.mock('@/helper/requestError', () => ({ notifyRequestError: vi.fn() }))

vi.mock('@/store/settings', () => ({
  groupTestUrls: { value: [] },
  independentLatencyTest: { value: false },
  speedtestUrl: { value: '' },
}))

vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal<typeof VueUse>()
  return {
    ...actual,
    useStorage: (_key: string, initialValue: unknown) => ({ value: initialValue }),
  }
})

vi.mock('./clash', () => clashActions)

import type { ProxyProvider } from '@/types'
import { healthCheckProxyProvider, proxyProviederList, refreshProxyProvider } from './index'

const provider = (capabilities: Partial<Pick<ProxyProvider, 'canRefresh' | 'canHealthCheck'>>) =>
  ({
    name: 'remote',
    proxies: [],
    testUrl: '',
    updatedAt: '',
    vehicleType: 'HTTP',
    canRefresh: true,
    canHealthCheck: true,
    ...capabilities,
  }) satisfies ProxyProvider

describe('Provider facade', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('routes supported actions through the active backend', async () => {
    proxyProviederList.value = [provider({})]

    await refreshProxyProvider('remote')
    await healthCheckProxyProvider('remote')

    expect(clashActions.refreshProxyProvider).toHaveBeenCalledWith('remote')
    expect(clashActions.healthCheckProxyProvider).toHaveBeenCalledWith('remote')
  })

  it('blocks actions missing the advertised capability', async () => {
    proxyProviederList.value = [provider({ canRefresh: false, canHealthCheck: false })]

    await expect(refreshProxyProvider('remote')).rejects.toThrow('not supported')
    await expect(healthCheckProxyProvider('remote')).rejects.toThrow('not supported')

    expect(clashActions.refreshProxyProvider).not.toHaveBeenCalled()
    expect(clashActions.healthCheckProxyProvider).not.toHaveBeenCalled()
  })
})
