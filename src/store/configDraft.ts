import { fetchDraftAPI, fetchStatusAPI, saveDraftAPI, testProviderAPI } from '@/api/config/client'
import {
  isConditionNode,
  type ConditionItem,
  type ConditionNode,
  type ControlPlaneStatus,
  type DraftMeta,
  type DraftState,
  type TestProviderNode,
} from '@/api/config/types'
import { showNotification } from '@/helper/notification'
import { reactive, ref } from 'vue'
const defaultDraft: DraftState = {
  base: {},
  providers: [
    {
      id: 'jms-prod',
      name: 'JustMySocks (CN2 GIA/BGP)',
      type: 'remote',
      url: 'https://ops.cagedbird.cn/sub/jms',
      mirror_url: 'https://submirror.cagedbird.cn/jms',
      interval: '24h',
      proxy_prefix: 'JMS',
      health_check: {
        enabled: true,
        url: 'https://www.gstatic.com/generate_204',
        interval: '10m',
      },
      enabled: true,
      node_count: 5,
      updated_at: '2026-08-16T12:00:00Z',
      regions: { HK: 2, JP: 1, US: 2 },
    },
    {
      id: 'wangwei-prod',
      name: 'WangWei Direct Link',
      type: 'remote',
      url: 'https://ops.cagedbird.cn/sub/wangwei',
      mirror_url: 'https://submirror.cagedbird.cn/wangwei',
      interval: '12h',
      proxy_prefix: 'WW',
      health_check: {
        enabled: true,
        url: 'https://www.gstatic.com/generate_204',
        interval: '10m',
      },
      enabled: true,
      node_count: 8,
      updated_at: '2026-08-16T12:00:00Z',
      regions: { HK: 3, JP: 2, SG: 2, US: 1 },
    },
  ],
  groups: [
    {
      id: 'proxy-auto',
      name: '🚀 节点选择 (Proxy)',
      type: 'selector',
      outbounds: ['🇭🇰 香港自动', '🇯🇵 日本自动', '🇸🇬 新加坡自动', '🇺🇸 美国自动', 'DIRECT'],
      providers: ['jms-prod', 'wangwei-prod'],
      description: '主代理出口路由选择',
    },
    {
      id: 'hk-auto',
      name: '🇭🇰 香港自动',
      type: 'urltest',
      outbounds: [],
      providers: ['jms-prod', 'wangwei-prod'],
      filter: {
        logic: 'and',
        conditions: [{ field: 'name', op: 'contains', value: '香港|HK|Hong Kong' }],
      },
      url: 'https://www.gstatic.com/generate_204',
      interval: '5m',
      tolerance: 50,
      interrupt_exist_connections: false,
    },
    {
      id: 'jp-auto',
      name: '🇯🇵 日本自动',
      type: 'urltest',
      outbounds: [],
      providers: ['jms-prod', 'wangwei-prod'],
      filter: {
        logic: 'and',
        conditions: [{ field: 'name', op: 'contains', value: '日本|JP|Tokyo|Japan' }],
      },
      url: 'https://www.gstatic.com/generate_204',
      interval: '5m',
      tolerance: 50,
      interrupt_exist_connections: false,
    },
    {
      id: 'us-auto',
      name: '🇺🇸 美国自动',
      type: 'urltest',
      outbounds: [],
      providers: ['jms-prod', 'wangwei-prod'],
      filter: {
        logic: 'and',
        conditions: [{ field: 'name', op: 'contains', value: '美国|US|United States|LA' }],
      },
      url: 'https://www.gstatic.com/generate_204',
      interval: '5m',
      tolerance: 50,
      interrupt_exist_connections: false,
    },
  ],
  routes: {
    final: '🚀 节点选择 (Proxy)',
    auto_detect_interface: true,
    default_domain_resolver: 'dns-remote',
    rules: [
      {
        id: 'rule-ads',
        priority: 1,
        enabled: true,
        action: 'reject',
        geosite: ['category-ads-all'],
        description: '广告拦截规则',
      },
      {
        id: 'rule-direct',
        priority: 2,
        enabled: true,
        action: 'direct',
        geosite: ['cn', 'private'],
        geoip: ['cn', 'private'],
        description: '中国大陆直连与局域网',
      },
      {
        id: 'rule-ai',
        priority: 3,
        enabled: true,
        action: 'route',
        outbound: '🇺🇸 美国自动',
        geosite: ['openai', 'anthropic', 'github'],
        description: 'AI 与开发者服务分流',
      },
      {
        id: 'rule-media',
        priority: 4,
        enabled: true,
        action: 'route',
        outbound: '🇭🇰 香港自动',
        geosite: ['youtube', 'netflix', 'bilibili'],
        description: '流媒体专用出口',
      },
    ],
  },
  dns: {
    final: 'dns-remote',
    strategy: 'prefer_ipv4',
    servers: [
      {
        id: 'dns-remote',
        tag: 'dns-remote',
        address: 'https://1.1.1.1/dns-query',
        address_resolver: 'dns-direct',
        address_strategy: 'prefer_ipv4',
        detour: '🚀 节点选择 (Proxy)',
      },
      {
        id: 'dns-direct',
        tag: 'dns-direct',
        address: 'https://223.5.5.5/dns-query',
        address_strategy: 'prefer_ipv4',
        detour: 'DIRECT',
      },
      {
        id: 'dns-block',
        tag: 'dns-block',
        address: 'rcode://success',
      },
    ],
    rules: [
      {
        id: 'dns-rule-ads',
        priority: 1,
        enabled: true,
        server: 'dns-block',
        geosite: ['category-ads-all'],
        disable_cache: true,
        description: '广告域名 DNS 丢弃',
      },
      {
        id: 'dns-rule-cn',
        priority: 2,
        enabled: true,
        server: 'dns-direct',
        geosite: ['cn'],
        description: '国内域名直连解析',
      },
    ],
  },
  inbounds: [
    {
      id: 'tun-in',
      tag: 'tun-in',
      type: 'tun',
      platforms: ['macos', 'linux', 'android'],
      auto_route: true,
      strict_route: true,
      stack: 'mixed',
      mtu: 9000,
      inet4_address: '172.19.0.1/30',
      sniff: true,
      sniff_override_destination: false,
      enabled: true,
    },
    {
      id: 'mixed-in',
      tag: 'mixed-in',
      type: 'mixed',
      platforms: ['macos', 'linux', 'rootless'],
      listen: '127.0.0.1',
      listen_port: 7890,
      sniff: true,
      sniff_override_destination: false,
      enabled: true,
    },
  ],
  overlays: {
    macos: {
      fakeip: {
        inbounds: [{ tag: 'tun-in', stack: 'system' }],
        dns: { fakeip: { enabled: true, inet4_range: '198.18.0.0/15' } },
      },
      realip: {
        inbounds: [{ tag: 'tun-in', stack: 'system' }],
        dns: { fakeip: { enabled: false } },
      },
    },
    linux: {
      fakeip: {
        inbounds: [{ tag: 'tun-in', stack: 'mixed' }],
        dns: { fakeip: { enabled: true, inet4_range: '198.18.0.0/15' } },
      },
      realip: {
        inbounds: [{ tag: 'tun-in', stack: 'mixed' }],
        dns: { fakeip: { enabled: false } },
      },
    },
    android: {
      fakeip: {
        inbounds: [{ tag: 'tun-in', auto_route: true }],
        dns: { fakeip: { enabled: true, inet4_range: '198.18.0.0/15' } },
      },
      realip: {
        inbounds: [{ tag: 'tun-in', auto_route: true }],
        dns: { fakeip: { enabled: false } },
      },
    },
    rootless: {
      fakeip: {
        inbounds: [{ tag: 'mixed-in', listen_port: 7890 }],
        dns: { fakeip: { enabled: true } },
      },
      realip: {
        inbounds: [{ tag: 'mixed-in', listen_port: 7890 }],
        dns: { fakeip: { enabled: false } },
      },
    },
  },
}

export const draftState = reactive<DraftState>(JSON.parse(JSON.stringify(defaultDraft)))
export const draftMeta = ref<DraftMeta>({
  branch: 'draft/cagedbird',
  updated_at: new Date().toISOString(),
  dirty: false,
  last_commit: 'HEAD',
})
export const controlPlaneStatus = ref<ControlPlaneStatus>({
  status: 'ok',
  draft: {
    dirty: false,
    branch: 'draft/cagedbird',
    last_commit: 'HEAD',
  },
})

export const isLoading = ref(false)
export const isSaving = ref(false)
export const isTestingProvider = ref(false)

// Home Assistant condition to regex compiler for sing-box
export function conditionItemToRegex(item: ConditionItem): string {
  const val = item.value.trim()
  if (!val) return '.*'

  switch (item.op) {
    case 'equals':
      return `^${escapeRegex(val)}$`
    case 'starts_with':
      return `^${escapeRegex(val)}`
    case 'ends_with':
      return `${escapeRegex(val)}$`
    case 'regex':
      return val
    case 'contains':
    default:
      // If value already contains pipes or regex symbols, preserve it with case-insensitivity
      if (val.includes('|')) {
        return `(?i)${val}`
      }
      return `(?i)${escapeRegex(val)}`
  }
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function compileConditionNode(node: ConditionNode): {
  includes: string[]
  excludes: string[]
} {
  const includes: string[] = []
  const excludes: string[] = []

  if (!node || !Array.isArray(node.conditions) || node.conditions.length === 0) {
    return { includes, excludes }
  }

  const subRegexes: string[] = []

  for (const cond of node.conditions) {
    if (isConditionNode(cond)) {
      const nested = compileConditionNode(cond)
      if (node.logic === 'not') {
        excludes.push(...nested.includes)
      } else {
        includes.push(...nested.includes)
        excludes.push(...nested.excludes)
      }
    } else {
      const reg = conditionItemToRegex(cond)
      if (reg) subRegexes.push(reg)
    }
  }

  if (subRegexes.length > 0) {
    if (node.logic === 'not') {
      excludes.push(...subRegexes)
    } else if (node.logic === 'or') {
      // combine OR conditions
      includes.push(subRegexes.join('|'))
    } else {
      // AND logic: separate patterns or combined regex
      includes.push(...subRegexes)
    }
  }

  return { includes, excludes }
}

// Live node matcher for testing conditions in UI
export function evaluateConditionItem(node: TestProviderNode, item: ConditionItem): boolean {
  let targetVal = ''
  if (item.field === 'name') targetVal = node.name || ''
  else if (item.field === 'type') targetVal = node.type || ''
  else if (item.field === 'server') targetVal = node.server || ''
  else if (item.field === 'port') targetVal = String(node.port || '')

  const val = item.value.trim()
  if (!val) return true

  switch (item.op) {
    case 'equals':
      return targetVal.toLowerCase() === val.toLowerCase()
    case 'starts_with':
      return targetVal.toLowerCase().startsWith(val.toLowerCase())
    case 'ends_with':
      return targetVal.toLowerCase().endsWith(val.toLowerCase())
    case 'regex':
      try {
        const r = new RegExp(val, 'i')
        return r.test(targetVal)
      } catch {
        return false
      }
    case 'contains':
    default:
      if (val.includes('|')) {
        const parts = val.split('|').map((p) => p.trim().toLowerCase())
        return parts.some((p) => p && targetVal.toLowerCase().includes(p))
      }
      return targetVal.toLowerCase().includes(val.toLowerCase())
  }
}

export function evaluateConditionNode(
  node: TestProviderNode,
  conditionNode: ConditionNode,
): boolean {
  if (!conditionNode || !conditionNode.conditions || conditionNode.conditions.length === 0) {
    return true
  }

  const results = conditionNode.conditions.map((item) => {
    if (isConditionNode(item)) {
      return evaluateConditionNode(node, item)
    }
    return evaluateConditionItem(node, item)
  })

  if (conditionNode.logic === 'and') {
    return results.every(Boolean)
  }
  if (conditionNode.logic === 'or') {
    return results.some(Boolean)
  }
  if (conditionNode.logic === 'not') {
    return !results.some(Boolean)
  }
  return true
}

export const loadDraft = async () => {
  isLoading.value = true
  try {
    const [draftRes, statusRes] = await Promise.all([
      fetchDraftAPI().catch(() => null),
      fetchStatusAPI().catch(() => null),
    ])

    if (draftRes?.draft) {
      Object.assign(draftState, draftRes.draft)
      if (draftRes.meta) {
        draftMeta.value = draftRes.meta
      }
    }
    if (statusRes) {
      controlPlaneStatus.value = statusRes
    }
  } catch (err: unknown) {
    console.error('Failed to load draft from API, using default', err)
  } finally {
    isLoading.value = false
  }
}

export const saveDraft = async (message?: string): Promise<boolean> => {
  isSaving.value = true
  try {
    const res = await saveDraftAPI(draftState, message)
    if (res.meta?.commit) {
      draftMeta.value.last_commit = res.meta.commit
      draftMeta.value.dirty = false
    }
    showNotification({
      content: 'Draft configuration saved successfully',
      type: 'alert-success',
    })
    return true
  } catch (err: unknown) {
    console.error('Failed to save draft', err)
    showNotification({
      content: 'Failed to save draft to control plane',
      type: 'alert-error',
    })
    return false
  } finally {
    isSaving.value = false
  }
}

export const testProvider = async (url: string) => {
  isTestingProvider.value = true
  try {
    const res = await testProviderAPI(url)
    showNotification({
      content: `Tested successfully: ${res.node_count} nodes found`,
      type: 'alert-success',
    })
    return res
  } catch (err: unknown) {
    console.error('Failed to test provider', err)
    showNotification({
      content: 'Failed to test provider subscription',
      type: 'alert-error',
    })
    throw err
  } finally {
    isTestingProvider.value = false
  }
}
