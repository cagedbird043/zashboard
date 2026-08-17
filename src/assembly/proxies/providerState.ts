import {
  ProviderHealthState,
  ProviderServiceCapability,
  type Provider,
  type ProviderList,
  type ProviderNode,
  type ProviderServiceInfo,
} from '@/gen/daemon/provider_service_pb'
import type { Proxy, ProxyProvider, SubscriptionInfo } from '@/types'

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER)

const toSafeNumber = (value: bigint) => {
  if (value <= 0n) return 0
  return Number(value > MAX_SAFE_BIGINT ? MAX_SAFE_BIGINT : value)
}

const toDateTime = (milliseconds: bigint) => {
  const value = toSafeNumber(milliseconds)
  return value ? new Date(value).toISOString() : ''
}

const mapNode = (providerTag: string, node: ProviderNode): Proxy => {
  const health = node.health
  const history =
    health && health.checkedAtMs > 0n
      ? [
          {
            time: toDateTime(health.checkedAtMs),
            delay: health.state === ProviderHealthState.REACHABLE ? health.delayMs : 0,
          },
        ]
      : []

  return {
    name: node.tag,
    type: node.type,
    history,
    extra: {},
    udp: node.networks.includes('udp'),
    now: '',
    icon: '',
    'provider-name': providerTag,
  }
}

const mapSubscription = (provider: Provider): SubscriptionInfo | undefined => {
  if (!provider.capabilities?.hasSubscriptionInfo || !provider.subscription) return undefined
  return {
    Upload: toSafeNumber(provider.subscription.uploadBytes),
    Download: toSafeNumber(provider.subscription.downloadBytes),
    Total: toSafeNumber(provider.subscription.totalBytes),
    Expire: toSafeNumber(provider.subscription.expireAtSeconds),
  }
}

export const mergeProviderProxyNodes = (
  providerNodes: Readonly<Record<string, Proxy>>,
  startedNodes: Readonly<Record<string, Proxy>>,
) => ({
  ...Object.fromEntries(Object.entries(providerNodes).map(([name, proxy]) => [name, { ...proxy }])),
  ...startedNodes,
})

interface ProviderViewState {
  providers: ProxyProvider[]
  nodes: Record<string, Proxy>
}

interface RevisionWaiter {
  instanceId: string
  revision: bigint
  resolve: () => void
  reject: (error: Error) => void
  timer?: ReturnType<typeof setTimeout>
}

export class ProviderSnapshotState {
  private capabilities = new Set<ProviderServiceCapability>()
  private waiters = new Set<RevisionWaiter>()
  private instanceId = ''
  private revision = -1n
  private view: ProviderViewState = { providers: [], nodes: {} }

  setServiceInfo(info: ProviderServiceInfo) {
    this.capabilities = new Set(info.capabilities)
  }

  get providers() {
    return this.view.providers
  }

  get nodes() {
    return this.view.nodes
  }

  apply(snapshot: ProviderList) {
    if (!snapshot.instanceId) throw new Error('Provider snapshot is missing instance_id')
    if (snapshot.instanceId === this.instanceId && snapshot.revision <= this.revision) return false

    const next = this.mapSnapshot(snapshot)
    const replacedInstance = this.instanceId !== '' && snapshot.instanceId !== this.instanceId
    this.instanceId = snapshot.instanceId
    this.revision = snapshot.revision
    this.view = next

    for (const waiter of this.waiters) {
      if (waiter.instanceId === this.instanceId && this.revision >= waiter.revision) {
        this.settle(waiter)
      } else if (replacedInstance && waiter.instanceId !== this.instanceId) {
        this.settle(
          waiter,
          new Error('ProviderService instance changed before revision was observed'),
        )
      }
    }
    return true
  }

  waitForRevision(instanceId: string, revision: bigint, timeout = 0) {
    if (this.instanceId === instanceId && this.revision >= revision) return Promise.resolve()
    if (this.instanceId && this.instanceId !== instanceId) {
      return Promise.reject(
        new Error('ProviderService instance changed before revision was observed'),
      )
    }

    return new Promise<void>((resolve, reject) => {
      const waiter: RevisionWaiter = { instanceId, revision, resolve, reject }
      if (timeout > 0) {
        waiter.timer = setTimeout(
          () => this.settle(waiter, new Error('Timed out waiting for Provider revision')),
          timeout,
        )
      }
      this.waiters.add(waiter)
    })
  }

  reset() {
    this.capabilities.clear()
    this.instanceId = ''
    this.revision = -1n
    this.view = { providers: [], nodes: {} }
    for (const waiter of this.waiters) {
      this.settle(waiter, new Error('ProviderService session reset'))
    }
  }

  private mapSnapshot(snapshot: ProviderList): ProviderViewState {
    const nodes: Record<string, Proxy> = {}
    const providers = snapshot.providers.map((provider): ProxyProvider => {
      const proxies = provider.nodes.map((node) => mapNode(provider.tag, node))
      for (const proxy of proxies) nodes[proxy.name] = proxy
      return {
        name: provider.tag,
        vehicleType: provider.type,
        updatedAt: toDateTime(provider.updatedAtMs),
        testUrl: '',
        subscriptionInfo: mapSubscription(provider),
        proxies,
        canRefresh:
          this.capabilities.has(ProviderServiceCapability.REFRESH) &&
          Boolean(provider.capabilities?.canRefresh),
        canHealthCheck:
          this.capabilities.has(ProviderServiceCapability.HEALTH_CHECK) &&
          Boolean(provider.capabilities?.canHealthCheck),
      }
    })
    return { providers, nodes }
  }

  private settle(waiter: RevisionWaiter, error?: Error) {
    if (!this.waiters.delete(waiter)) return
    if (waiter.timer) clearTimeout(waiter.timer)
    if (error) waiter.reject(error)
    else waiter.resolve()
  }
}

export const waitForCommittedProviderRevision = async (
  state: ProviderSnapshotState,
  instanceId: string,
  revision: bigint,
  listProviders: () => Promise<ProviderList>,
  timeout = 3000,
) => {
  try {
    await state.waitForRevision(instanceId, revision, timeout)
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'Timed out waiting for Provider revision') {
      throw error
    }
    state.apply(await listProviders())
    await state.waitForRevision(instanceId, revision)
  }
}
