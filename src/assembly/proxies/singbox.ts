// sing-box API(gRPC daemon.StartedService)后端的代理「组装逻辑」。
// 与 clash 的「拉取式」不同,这里是「流驱动」:订阅 SubscribeGroups / SubscribeOutbounds,
// 每次推送直接重建门面 index.ts 的共享状态,因此选择/测速后无需手动刷新,
// 结果会随流自动回填到 UI。
import { getSingboxClient, type SingboxClient } from '@/api/singbox/client'
import {
  healthCheckProviderAPI,
  listProvidersAPI,
  refreshProviderAPI,
  subscribeProviderService,
} from '@/api/singbox/providers'
import type { StreamHandle } from '@/api/singbox/streams'
import { subscribeStream } from '@/api/singbox/subscriptions'
import { disconnectByIdAPI } from '@/assembly/connections'
import type { Group, GroupItem, Groups, OutboundList } from '@/gen/daemon/started_service_pb'
import { getConnectionChains } from '@/helper'
import { activeConnections } from '@/store/connections'
import { automaticDisconnection, iconReflectList, speedtestTimeout } from '@/store/settings'
import { activeBackend } from '@/store/setup'
import type { Proxy } from '@/types'
import { proxyGroupList, proxyMap, proxyProviederList } from './index'
import {
  mergeProviderProxyNodes,
  ProviderSnapshotState,
  waitForCommittedProviderRevision,
} from './providerState'

const getHistoryFromItem = (item: GroupItem): Proxy['history'] =>
  item.urlTestDelay > 0
    ? [
        {
          time: new Date(Number(item.urlTestTime) * 1000).toISOString(),
          delay: item.urlTestDelay,
        },
      ]
    : []

const nodeToProxy = (item: GroupItem): Proxy => {
  return {
    name: item.tag,
    type: item.type,
    now: '',
    history: getHistoryFromItem(item),
    extra: {},
    icon: '',
  }
}

const providerState = new ProviderSnapshotState()
let groups = new Map<string, Group>()
let outbounds = new Map<string, GroupItem>()
let handles: StreamHandle[] = []
let sessionClient: SingboxClient | null = null
let sessionKey = ''
let ready: Promise<void> | null = null

type URLTestWaiter = {
  resolve: () => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

const urlTestWaiters = new Set<URLTestWaiter>()

const resolveURLTestWaiters = () => {
  for (const waiter of urlTestWaiters) {
    clearTimeout(waiter.timer)
    waiter.resolve()
  }
  urlTestWaiters.clear()
}

const rejectURLTestWaiters = (reason: Error) => {
  for (const waiter of urlTestWaiters) {
    clearTimeout(waiter.timer)
    waiter.reject(reason)
  }
  urlTestWaiters.clear()
}

const waitForURLTestResult = (timeout: number) => {
  let waiter!: URLTestWaiter
  const promise = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => {
        urlTestWaiters.delete(waiter)
        reject(new Error('sing-box URL test result timeout'))
      },
      Math.max(5000, timeout) + 1000,
    )

    waiter = { resolve, reject, timer }
    urlTestWaiters.add(waiter)
  })

  return {
    promise,
    cancel: () => {
      clearTimeout(waiter.timer)
      urlTestWaiters.delete(waiter)
    },
  }
}

// 由流数据原生组装共享状态(无 clash 的 provider / GLOBAL / 排序等概念)。
const rebuild = () => {
  const startedProxies: Record<string, Proxy> = {}

  // 1) 出站叶子节点(含延迟)
  for (const item of outbounds.values()) {
    startedProxies[item.tag] = nodeToProxy(item)
  }
  // 2) 用组内 items 补建缺失的叶子节点(outbounds 流可能晚到或不含某些成员)
  for (const group of groups.values()) {
    for (const item of group.items) {
      if (!startedProxies[item.tag]) startedProxies[item.tag] = nodeToProxy(item)
    }
  }
  // 3) 分组条目(携带 all / now),始终覆盖同名节点
  for (const group of groups.values()) {
    startedProxies[group.tag] = {
      name: group.tag,
      type: group.type,
      now: group.selected,
      all: group.items.map((i) => i.tag),
      selectable: group.selectable,
      history: [],
      extra: {},
      icon: '',
    }
  }
  // 4) 把组内 items 的延迟回填到叶子节点(绝不动带 all 的组条目)
  for (const group of groups.values()) {
    for (const item of group.items) {
      const node = startedProxies[item.tag]
      if (node && !node.all?.length && item.urlTestDelay > 0) {
        node.history = getHistoryFromItem(item)
      }
    }
  }
  const proxies = mergeProviderProxyNodes(providerState.nodes, startedProxies)
  // 5) 应用用户配置的「名称→图标」映射(与 clash 一致,sing-box 流不含图标)
  for (const iconReflect of iconReflectList.value) {
    const node = proxies[iconReflect.name]
    if (node) node.icon = iconReflect.icon
  }

  proxyMap.value = proxies
  proxyGroupList.value = Array.from(groups.values())
    .filter((g) => g.items.length)
    .map((g) => g.tag)
  proxyProviederList.value = providerState.providers
}

const closeStreams = () => {
  handles.forEach((h) => h.close())
  handles = []
  rejectURLTestWaiters(new Error('sing-box proxy stream closed'))
  sessionKey = ''
  sessionClient = null
  ready = null
}

const stop = () => {
  closeStreams()
  groups = new Map()
  outbounds = new Map()
  providerState.reset()
  rebuild()
}

const ensureSession = () => {
  const backend = activeBackend.value
  const singboxClient = getSingboxClient()
  const client = singboxClient?.client
  if (!backend || backend.type !== 'singbox' || !client) {
    stop()
    return
  }
  if (sessionKey === backend.uuid && sessionClient === singboxClient && handles.length) return

  stop()
  sessionClient = singboxClient
  sessionKey = backend.uuid

  let resolveReady!: () => void
  let resolved = false
  ready = new Promise<void>((r) => (resolveReady = r))

  handles = [
    subscribeStream<Groups>('groups', (msg) => {
      groups = new Map()
      for (const g of msg.group) groups.set(g.tag, g)
      rebuild()
      if (!resolved) {
        resolved = true
        resolveReady()
      } else {
        // URLTest RPC 只负责启动任务；历史记录更新后，结果才会通过此订阅推送。
        resolveURLTestWaiters()
      }
    }),
    subscribeStream<OutboundList>('outbounds', (msg) => {
      outbounds = new Map()
      for (const o of msg.outbounds) outbounds.set(o.tag, o)
      rebuild()
    }),
    subscribeProviderService({
      onInfo: (info) => providerState.setServiceInfo(info),
      onSnapshot: (snapshot) => {
        if (providerState.apply(snapshot)) rebuild()
      },
      onUnsupported: () => {
        providerState.reset()
        rebuild()
      },
    }),
  ]
}

// 在后端切换 / 登出时丢弃订阅。
export const resetProxies = () => stop()

export const fetchProxies = async () => {
  ensureSession()
  if (ready) await ready
  rebuild()
}

const waitForProviderAction = async (result: { instanceId: string; revision: bigint }) => {
  await waitForCommittedProviderRevision(
    providerState,
    result.instanceId,
    result.revision,
    listProvidersAPI,
  )
  rebuild()
}

export const refreshProxyProvider = async (name: string) => {
  ensureSession()
  await waitForProviderAction(await refreshProviderAPI(name))
}

export const healthCheckProxyProvider = async (name: string) => {
  ensureSession()
  await waitForProviderAction(await healthCheckProviderAPI(name))
}

export const handlerProxySelect = async (proxyGroupName: string, proxyName: string) => {
  const client = getSingboxClient()?.client
  const proxyGroup = proxyMap.value[proxyGroupName]
  if (!client || proxyGroup?.selectable === false) return

  await client.selectOutbound({ groupTag: proxyGroupName, outboundTag: proxyName })

  // 乐观更新,流随后会确认
  const group = groups.get(proxyGroupName)
  if (group) {
    group.selected = proxyName
    rebuild()
  }

  if (automaticDisconnection.value) {
    activeConnections.value
      .filter((c) => getConnectionChains(c).includes(proxyGroupName))
      .forEach((c) => disconnectByIdAPI(c.id))
  }
}

const runURLTest = async (outboundTag: string, timeout = speedtestTimeout.value) => {
  ensureSession()
  if (ready) await ready

  const client = getSingboxClient()?.client
  if (!client) return

  // 先注册等待，避免测速很快时结果推送早于一元 RPC 响应而丢失。
  const result = waitForURLTestResult(timeout)
  try {
    await Promise.all([client.uRLTest({ outboundTag }), result.promise])
  } finally {
    result.cancel()
  }
}

// sing-box API 支持直接测试单个 outbound;节点卡片传节点自身的 tag。
export const proxyLatencyTest = async (
  proxyName: string,
  _url?: string,
  timeout = speedtestTimeout.value,
) => {
  await runURLTest(proxyName, timeout)
}

export const proxyGroupLatencyTest = async (proxyGroupName: string) => {
  await runURLTest(proxyGroupName)
}

export const allProxiesLatencyTest = async () => {
  await Promise.allSettled(Array.from(groups.keys()).map((tag) => runURLTest(tag)))
}
