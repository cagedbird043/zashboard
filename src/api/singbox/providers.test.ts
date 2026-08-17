/* @vitest-environment happy-dom */
import { ProviderService } from '@/gen/daemon/provider_service_pb'
import { Code, ConnectError } from '@connectrpc/connect'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface StreamOptions {
  onError?: (error: unknown) => void
  shouldRetry?: (error: unknown) => boolean
}

type RunStreamMock = (
  factory: unknown,
  onMessage: unknown,
  options: StreamOptions,
) => { close: () => void }

const mocks = vi.hoisted(() => ({
  runStream: vi.fn<RunStreamMock>(() => ({ close: vi.fn() })),
}))

vi.mock('./client', () => ({
  getSingboxClient: () => ({
    providerClient: {
      getServiceInfo: vi.fn(),
      listProviders: vi.fn(),
      refreshProvider: vi.fn(),
      healthCheckProvider: vi.fn(),
    },
  }),
}))

vi.mock('./serverStream', () => ({
  serverStream: async function* () {},
}))

vi.mock('./streams', () => ({
  runStream: mocks.runStream,
}))

import { isProviderServiceUnsupported, subscribeProviderService } from './providers'

describe('ProviderService session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('preserves the exact GetServiceInfo wire method name', () => {
    expect(ProviderService.method.getServiceInfo.name).toBe('GetServiceInfo')
  })

  it('stops only for UNIMPLEMENTED and keeps transient failures retryable', () => {
    const onUnsupported = vi.fn()
    const onTransientError = vi.fn()
    subscribeProviderService({
      onInfo: vi.fn(),
      onSnapshot: vi.fn(),
      onUnsupported,
      onTransientError,
    })
    const options = mocks.runStream.mock.calls[0]![2]
    const unsupported = new ConnectError('unsupported', Code.Unimplemented)
    const transient = new ConnectError('unavailable', Code.Unavailable)

    options.onError?.(unsupported)
    expect(isProviderServiceUnsupported(unsupported)).toBe(true)
    expect(options.shouldRetry?.(unsupported)).toBe(false)
    expect(onUnsupported).toHaveBeenCalledOnce()

    options.onError?.(transient)
    expect(isProviderServiceUnsupported(transient)).toBe(false)
    expect(options.shouldRetry?.(transient)).toBe(true)
    expect(onTransientError).toHaveBeenCalledWith(transient)
  })
})
