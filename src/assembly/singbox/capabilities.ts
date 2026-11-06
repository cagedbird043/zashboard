import type { singboxProviderCapabilities } from '../capabilities'

// API 版本由 /version 探测得到，切换后端时由 backend.resetCore 清零。
const USBIP_MIN_API_VERSION = 2
const OPENVPN_MIN_API_VERSION = 3
const TAILDROP_MIN_API_VERSION = 4

export type SingboxCap =
  | 'clashMode'
  | 'customGlobalNode'
  | 'logTypeFilter'
  | 'logConnectionDetail'
  | 'disconnectOnModeChange'
  | 'extraLogLevels'
  | 'tools'
  | 'goroutines'
  | 'startedAt'
  | 'usbip'
  | 'openvpn'
  | 'taildrop'
  | 'rules'

// Clash 兼容通道仍使用 Clash 能力表，只补充 sing-box 内核侧差异。
export const getSingboxClashCapabilities = (singboxCore: boolean) => ({
  clashMode: true,
  customGlobalNode: singboxCore,
  logTypeFilter: singboxCore,
  logConnectionDetail: singboxCore,
  disconnectOnModeChange: singboxCore,
  extraLogLevels: singboxCore,
  rules: true,
})

// 仅用于 sing-box gRPC 通道。Provider 能力取响应状态，不由 API 版本猜测。
export const getSingboxCapabilities = (
  apiVersion: number,
  providers: typeof singboxProviderCapabilities.value,
) => ({
  tools: true,
  goroutines: true,
  startedAt: true,
  usbip: apiVersion >= USBIP_MIN_API_VERSION,
  openvpn: apiVersion >= OPENVPN_MIN_API_VERSION,
  taildrop: apiVersion >= TAILDROP_MIN_API_VERSION,

  customGlobalNode: true,
  logTypeFilter: true,
  logConnectionDetail: true,
  disconnectOnModeChange: true,
  extraLogLevels: true,
  traceLogLevel: true,
  silentLogLevel: true,

  latencyTest: true,
  nodeLatencyTest: true,
  proxyProviderUpdate: providers.refresh,
  proxyProviderHealthCheck: providers.healthCheck,
  customTestUrl: true,
  connectionsClose: true,
  clashMode: true,
  rules: false,
})
