import { getSingboxClient } from '@/api/singbox/client'
import { serverStream } from '@/api/singbox/serverStream'
import { runStream, type StreamHandle } from '@/api/singbox/streams'
import { singboxProviderCapabilities } from '@/assembly/capabilities'
import { ProviderService, ProviderServiceCapability, ProviderHealthState, type Provider, type ProviderList, type ProviderActionResult } from '@/gen/daemon/provider_service_pb'
import { activeBackend } from '@/store/setup'
import type { ProxyProvider } from '@/types'
import { Code, ConnectError } from '@connectrpc/connect'
import { ref } from 'vue'

export const nativeProviders = ref<ProxyProvider[]>([])
let stream: StreamHandle | null = null
let controller: AbortController | null = null
let session = 0
let instance = ''
let revision = 0n
let providers = new Map<string, Provider>()
let notify = () => {}

const publish = () => {
  nativeProviders.value = Array.from(providers.values()).map((provider) => ({
    name: provider.tag,
    vehicleType: provider.type,
    updatedAt: provider.updatedAtMs ? new Date(Number(provider.updatedAtMs)).toISOString() : '',
    url: provider.url || undefined,
    canRefresh: provider.capabilities?.canRefresh === true,
    canHealthCheck: provider.capabilities?.canHealthCheck === true,
    testUrl: '',
    subscriptionInfo: provider.subscription ? {
      Upload: Number(provider.subscription.uploadBytes),
      Download: Number(provider.subscription.downloadBytes),
      Total: Number(provider.subscription.totalBytes),
      Expire: Number(provider.subscription.expireAtSeconds),
    } : undefined,
    proxies: provider.nodes.map((node) => ({
      name: node.tag,
      type: node.type,
      now: '',
      icon: '',
      extra: {},
      'provider-name': provider.tag,
      history: node.health?.checkedAtMs ? [{
        time: new Date(Number(node.health.checkedAtMs)).toISOString(),
        delay: node.health.state === ProviderHealthState.REACHABLE ? Math.max(1, node.health.delayMs) : 0,
      }] : [],
    })),
  }))
  notify()
}

const applyList = (list: ProviderList) => {
  if (list.instanceId === instance && list.revision < revision) return
  instance = list.instanceId
  revision = list.revision
  providers = new Map(list.providers.map((provider) => [provider.tag, provider]))
  publish()
}

const applyAction = (result: Pick<ProviderActionResult, 'instanceId' | 'revision' | 'provider'>) => {
  if (result.instanceId !== instance) return
  if (result.revision < revision || !result.provider) return
  revision = result.revision
  providers.set(result.provider.tag, result.provider)
  publish()
}

export const resetProviders = () => {
  session++
  controller?.abort()
  controller = null
  stream?.close()
  stream = null
  providers.clear()
  nativeProviders.value = []
  instance = ''
  revision = 0n
  notify = () => {}
  singboxProviderCapabilities.value = { refresh: false, healthCheck: false }
}

export const startProviders = async (onUpdate: () => void) => {
  resetProviders()
  const token = session
  const backendId = activeBackend.value?.uuid
  const client = getSingboxClient()?.providers
  if (!client) return
  controller = new AbortController()
  const options = { signal: controller.signal, timeoutMs: 10000 }
  const alive = () => session === token && activeBackend.value?.uuid === backendId && activeBackend.value?.type === 'singbox'
  try {
    const info = await client.getServiceInfo({}, options)
    if (!alive()) return
    if (!info.capabilities.includes(ProviderServiceCapability.LIST)) return
    const list = await client.listProviders({}, options)
    if (!alive()) return
    notify = onUpdate
    singboxProviderCapabilities.value = {
      refresh: info.capabilities.includes(ProviderServiceCapability.REFRESH),
      healthCheck: info.capabilities.includes(ProviderServiceCapability.HEALTH_CHECK),
    }
    applyList(list)
    if (info.capabilities.includes(ProviderServiceCapability.SUBSCRIBE)) {
      stream = runStream<ProviderList>(
        (signal) => serverStream(ProviderService.method.subscribeProviders, {}, signal),
        (message) => { if (alive()) applyList(message) },
      )
    }
  } catch (error) {
    if (!alive() || options.signal.aborted) return
    if (error instanceof ConnectError && error.code === Code.Unimplemented) return
    throw error
  }
}

export const refreshProvider = async (name: string) => {
  const client = getSingboxClient()?.providers
  if (!client) throw new Error('sing-box backend unavailable')
  const token = session
  const result = await client.refreshProvider({ providerTag: name })
  if (token === session) applyAction(result)
}

export const healthCheckProvider = async (name: string) => {
  const client = getSingboxClient()?.providers
  if (!client) throw new Error('sing-box backend unavailable')
  const token = session
  const result = await client.healthCheckProvider({ providerTag: name })
  if (token === session) applyAction(result)
}
