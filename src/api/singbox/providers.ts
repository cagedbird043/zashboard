import {
  ProviderService,
  type ProviderList,
  type ProviderServiceInfo,
} from '@/gen/daemon/provider_service_pb'
import { Code, ConnectError } from '@connectrpc/connect'
import { getSingboxClient } from './client'
import { serverStream } from './serverStream'
import { runStream, type StreamHandle } from './streams'

export const PROVIDER_SERVICE_PROTOCOL_VERSION = 1

export const isProviderServiceUnsupported = (error: unknown) =>
  error instanceof ConnectError && error.code === Code.Unimplemented

const getProviderClient = () => {
  const client = getSingboxClient()?.providerClient
  if (!client) throw new Error('sing-box ProviderService client is not available')
  return client
}

export interface ProviderSubscriptionCallbacks {
  onInfo: (info: ProviderServiceInfo) => void
  onSnapshot: (snapshot: ProviderList) => void
  onUnsupported: () => void
  onTransientError?: (error: unknown) => void
}

export const subscribeProviderService = (callbacks: ProviderSubscriptionCallbacks): StreamHandle =>
  runStream(
    async function* (signal) {
      const client = getProviderClient()
      const info = await client.getServiceInfo({}, { signal })
      if (info.protocolVersion !== PROVIDER_SERVICE_PROTOCOL_VERSION) {
        throw new Error(`Unsupported ProviderService protocol version: ${info.protocolVersion}`)
      }
      callbacks.onInfo(info)
      yield* serverStream(ProviderService.method.subscribeProviders, {}, signal)
    },
    callbacks.onSnapshot,
    {
      onError: (error) => {
        if (isProviderServiceUnsupported(error)) callbacks.onUnsupported()
        else callbacks.onTransientError?.(error)
      },
      shouldRetry: (error) => !isProviderServiceUnsupported(error),
    },
  )

export const listProvidersAPI = () => getProviderClient().listProviders({})

export const refreshProviderAPI = (providerTag: string) =>
  getProviderClient().refreshProvider({ providerTag })

export const healthCheckProviderAPI = (providerTag: string) =>
  getProviderClient().healthCheckProvider({ providerTag })
