export type ConditionField = 'name' | 'type' | 'server' | 'port'
export type ConditionOp = 'contains' | 'equals' | 'regex' | 'starts_with' | 'ends_with'
export type ConditionLogic = 'and' | 'or' | 'not'

export interface ConditionItem {
  id?: string
  field: ConditionField
  op: ConditionOp
  value: string
}

export interface ConditionNode {
  id?: string
  logic: ConditionLogic
  conditions: (ConditionItem | ConditionNode)[]
}

export function isConditionNode(item: ConditionItem | ConditionNode): item is ConditionNode {
  return 'logic' in item && Array.isArray((item as ConditionNode).conditions)
}

export interface ProviderHealthCheck {
  enabled: boolean
  url?: string
  interval?: string
}

export interface Provider {
  id: string
  name: string
  type: 'remote' | 'local' | 'inline'
  url: string
  mirror_url?: string
  interval?: string
  proxy_prefix?: string
  health_check?: ProviderHealthCheck
  enabled: boolean
  node_count?: number
  updated_at?: string
  regions?: Record<string, number>
}

export type GroupType = 'selector' | 'urltest' | 'loadbalance' | 'fallback'

export interface Group {
  id: string
  name: string
  type: GroupType
  outbounds: string[]
  providers?: string[]
  filter?: ConditionNode
  includes?: string[]
  excludes?: string[]
  url?: string
  interval?: string
  tolerance?: number
  interrupt_exist_connections?: boolean
  strategy?: string
  description?: string
}

export interface RouteRule {
  id: string
  priority: number
  enabled: boolean
  action: 'route' | 'reject' | 'direct' | 'sniff' | 'resolve'
  outbound?: string
  domain?: string[]
  domain_suffix?: string[]
  domain_keyword?: string[]
  domain_regex?: string[]
  geosite?: string[]
  ip_cidr?: string[]
  geoip?: string[]
  port?: number[]
  port_range?: string[]
  protocol?: string[]
  source_ip_cidr?: string[]
  source_port?: number[]
  process_name?: string[]
  package_name?: string[]
  network?: string[]
  inbound?: string[]
  rule_set?: string[]
  clash_mode?: string
  invert?: boolean
  description?: string
}

export interface DnsServer {
  id: string
  tag: string
  address: string
  address_resolver?: string
  address_strategy?: 'prefer_ipv4' | 'prefer_ipv6' | 'ipv4_only' | 'ipv6_only'
  strategy?: string
  detour?: string
  client_subnet?: string
}

export interface DnsRule {
  id: string
  priority: number
  enabled: boolean
  server: string
  domain?: string[]
  domain_suffix?: string[]
  domain_keyword?: string[]
  domain_regex?: string[]
  geosite?: string[]
  rule_set?: string[]
  disable_cache?: boolean
  rewrite_ttl?: number
  client_subnet?: string
  invert?: boolean
  description?: string
}

export type InboundType = 'tun' | 'mixed' | 'tproxy' | 'direct' | 'redirect' | 'socks' | 'http'
export type PlatformType = 'macos' | 'linux' | 'android' | 'rootless'
export type VariantType = 'fakeip' | 'realip'

export interface Inbound {
  id: string
  tag: string
  type: InboundType
  listen?: string
  listen_port?: number
  platforms?: PlatformType[]
  sniff?: boolean
  sniff_override_destination?: boolean
  auto_route?: boolean
  strict_route?: boolean
  inet4_address?: string
  inet6_address?: string
  mtu?: number
  stack?: 'system' | 'gvisor' | 'mixed'
  endpoint_independent_nat?: boolean
  enabled?: boolean
}

export interface Overlay {
  platform: PlatformType
  variant: VariantType
  overrides: Record<string, unknown>
  inherited_from?: string
}

export interface ReleaseRecord {
  revision: string
  message: string
  date: string
  author: string
  status?: 'active' | 'deployed' | 'rolled_back'
}

export interface DraftMeta {
  branch: string
  updated_at: string
  dirty: boolean
  last_commit?: string
}

export interface DraftState {
  base?: Record<string, unknown>
  providers: Provider[]
  groups: Group[]
  routes: {
    rules: RouteRule[]
    final?: string
    auto_detect_interface?: boolean
    default_domain_resolver?: string
  }
  dns: {
    servers: DnsServer[]
    rules: DnsRule[]
    final?: string
    strategy?: string
  }
  inbounds: Inbound[]
  overlays: Record<string, unknown>
}

export interface ControlPlaneStatus {
  status: string
  version?: string
  draft: {
    dirty: boolean
    branch: string
    last_commit: string
  }
  services?: Record<string, unknown>
}

export interface TestProviderNode {
  name: string
  type: string
  region: string
  server?: string
  port?: number
}

export interface TestProviderResult {
  status: string
  node_count: number
  regions: Record<string, number>
  nodes: TestProviderNode[]
}
