// 后端判别与公共能力表；sing-box 专属能力和版本门槛位于 singbox/capabilities。
// 能从响应数据自证的差异由对应的 assembly 子模块处理，不依赖内核版本猜测。

import { displayAllFeatures } from '@/store/settings'
import { activeBackend } from '@/store/setup'
import { computed, ref } from 'vue'
import { daeCapabilities, singboxProviderCapabilities } from './capabilities'
import {
  getSingboxCapabilities,
  getSingboxClashCapabilities,
  type SingboxCap,
} from './singbox/capabilities'

export enum Core {
  Mihomo = 'mihomo',
  Honk = 'honk',
  Singbox = 'singbox',
  Dae = 'dae',
  Unknown = 'unknown',
}

export const core = ref<Core>(Core.Unknown)

// sing-box gRPC API 版本,由 assembly/version.ts 在探测 /version 后写入,
// 后端切换时先重置,避免沿用上一个后端的结论。
export const apiVersion = ref(0)

export const resetCore = () => {
  core.value = Core.Unknown
  apiVersion.value = 0
}

// displayAllFeatures 的适用范围:Clash 通道上跑着非 mihomo 内核(sing-box / honk)时。
// 该开关的语义是「我用的 fork 版内核也支持这些 mihomo 扩展端点,先显示出来」——
// 只有在 Clash 通道上,那些端点才有可能存在。sing-box API(gRPC)通道上它们压根不是
// 同一套协议,掰开只会打出必然失败的请求,所以那里既不显示开关,存量的 true 也不生效。
// core 未探测出结论(Unknown)时不掰,免得凭空点亮一堆按钮。
const isNonMihomoCore = computed(
  () =>
    activeBackend.value?.type !== 'dae' &&
    activeBackend.value?.type !== 'singbox' &&
    (core.value === Core.Singbox || core.value === Core.Honk),
)

const isForkCoreOverride = computed(() => isNonMihomoCore.value && displayAllFeatures.value)

// 开关自身的可见性与其生效范围保持一致。
export const showDisplayAllFeatures = computed(() => !!activeBackend.value && isNonMihomoCore.value)

export type Cap =
  | 'coreUpgrade'
  | 'coreRestart'
  | 'dashboardUpgrade'
  | 'reloadConfigs'
  | 'updateConfigs'
  | 'updateGeoDatabase'
  | 'syncSettings'
  | 'independentLatency'
  | 'coreUpdateCheck'
  | 'configPatch'
  | SingboxCap
  | 'traceLogLevel'
  | 'silentLogLevel'
  | 'runtimeStats'
  | 'latencyTest'
  | 'proxyProviderUpdate'
  | 'proxyProviderHealthCheck'
  | 'ruleProviders'
  | 'flushDNSCache'
  | 'flushFakeIP'
  | 'dnsQuery'
  | 'connectionsClose'
  | 'connectionsFilterClose'
  | 'customTestUrl'
  | 'nodeLatencyTest'
  | 'metricsHistory'
  | 'backendEvents'
  | 'flows'
  | 'dnsCache'
  | 'dnsLog'
  | 'dnsRules'
  | 'routingTrace'
  | 'datapath'
  | 'runtimeSettings'
  | 'geodataSettings'
  | 'configSources'
  | 'configCreate'
  | 'configEdit'
  | 'entryManage'
  | 'groupConfigPatch'
  | 'lifecycleControl'

type Caps = Partial<Record<Cap, boolean>>

const clashCaps = computed<Caps>(() => {
  const mihomo = core.value === Core.Mihomo
  const honk = core.value === Core.Honk
  const singboxCore = core.value === Core.Singbox
  const mihomoOrForkCore = mihomo || isForkCoreOverride.value

  return {
    coreUpgrade: mihomoOrForkCore,
    coreRestart: mihomoOrForkCore,
    dashboardUpgrade: mihomoOrForkCore,
    reloadConfigs: mihomoOrForkCore,
    updateConfigs: mihomoOrForkCore,
    updateGeoDatabase: mihomoOrForkCore,
    syncSettings: mihomoOrForkCore,
    independentLatency: mihomoOrForkCore,
    coreUpdateCheck: mihomo,
    configPatch: mihomo,

    // sing-box 与 honk 有 trace,mihomo 没有
    traceLogLevel: honk || singboxCore,
    // silent:mihomo 与 sing-box 有,honk 没有
    silentLogLevel: mihomo || singboxCore,

    runtimeStats: honk,

    latencyTest: true,
    proxyProviderUpdate: true,
    proxyProviderHealthCheck: true,
    ruleProviders: true,
    flushDNSCache: true,
    flushFakeIP: true,
    dnsQuery: true,
    connectionsClose: true,
    customTestUrl: true,
    nodeLatencyTest: true,

    ...getSingboxClashCapabilities(singboxCore),
  }
})

const daeCaps = computed<Caps>(() => {
  const resources = daeCapabilities.value?.resources
  const settingFields = resources?.runtime_settings?.fields ?? []

  return {
    reloadConfigs: resources?.reload?.available === true,
    updateGeoDatabase: resources?.geodata?.can_update === true,

    traceLogLevel: resources?.logs?.levels?.includes('trace') === true,

    runtimeStats: resources?.runtime_outbounds?.available === true,

    latencyTest: resources?.probes?.available === true,
    proxyProviderUpdate: resources?.providers?.can_refresh === true,
    flushDNSCache: resources?.dns_cache?.flush === true,
    dnsQuery: resources?.dns_query?.available === true,
    connectionsClose: resources?.connections?.can_close === true,
    connectionsFilterClose: resources?.connections?.can_close === true,
    metricsHistory:
      resources?.traffic_history?.available === true ||
      resources?.memory_history?.available === true,
    backendEvents: resources?.events?.available === true,
    flows: resources?.flows?.available === true,
    dnsCache: resources?.dns_cache?.read === true,
    dnsLog: resources?.dns_log?.available === true,
    dnsRules: resources?.dns_rules?.available === true,
    routingTrace: resources?.routing_trace?.available === true,
    datapath: resources?.datapath?.available === true,
    runtimeSettings: resources?.runtime_settings?.available === true,
    geodataSettings:
      resources?.geodata?.configurable_sources === true && settingFields.includes('geodata'),
    configSources: resources?.config?.available === true,
    configEdit: resources?.config?.writable === true,
    configCreate: resources?.config?.writable === true && resources?.config?.create === true,
    entryManage: resources?.nodes?.can_manage === true || resources?.providers?.can_manage === true,
    groupConfigPatch: resources?.groups?.config_patch === true,
    lifecycleControl:
      resources?.suspend?.available === true && resources?.resume?.available === true,
  }
})

const singboxCaps = computed<Caps>(() =>
  getSingboxCapabilities(apiVersion.value, singboxProviderCapabilities.value),
)

const soft = computed<Caps>(() => {
  switch (activeBackend.value?.type) {
    case 'singbox':
      return singboxCaps.value
    case 'dae':
      return daeCaps.value
    default:
      return clashCaps.value
  }
})

export const can = (cap: Cap): boolean => {
  if (!activeBackend.value) return false

  return soft.value[cap] === true
}
