<template>
  <div class="flex flex-col gap-4">
    <!-- Header Summary Card -->
    <div class="base-container flex flex-wrap items-center justify-between gap-4 p-4 md:p-5">
      <div class="flex items-center gap-3">
        <div class="border-info/20 bg-info/10 text-info rounded-2xl border p-3">
          <ServerStackIcon class="h-6 w-6" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-base-content text-xl font-bold tracking-tight">
              DNS 引擎配置 (DNS Servers & Rules)
            </h2>
            <span class="badge badge-info badge-sm font-mono">
              {{ servers.length }} 服务器 / {{ rules.length }} 分流规则
            </span>
          </div>
          <p class="text-base-content/60 mt-0.5 text-xs">
            配置 Upstream DNS (DoH/DoT/UDP)、分流匹配规则、FakeIP/RealIP 策略与出站 Detour
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <div class="tabs tabs-box bg-base-200/80">
          <button
            type="button"
            class="tab tab-sm"
            :class="activeTab === 'servers' ? 'tab-active' : ''"
            @click="activeTab = 'servers'"
          >
            DNS 服务器 (Servers)
          </button>
          <button
            type="button"
            class="tab tab-sm"
            :class="activeTab === 'rules' ? 'tab-active' : ''"
            @click="activeTab = 'rules'"
          >
            分流规则 (Rules)
          </button>
        </div>

        <button
          type="button"
          class="btn btn-primary btn-sm"
          @click="openAddModal"
        >
          <PlusIcon class="h-4 w-4" />
          {{ activeTab === 'servers' ? '添加 DNS 服务器' : '添加 DNS 规则' }}
        </button>
      </div>
    </div>

    <!-- TAB 1: DNS SERVERS -->
    <div
      v-if="activeTab === 'servers'"
      class="flex flex-col gap-4"
    >
      <!-- Global DNS Strategy Card -->
      <div class="base-container flex flex-wrap items-center justify-between gap-4 p-4">
        <div class="flex items-center gap-4">
          <div>
            <label class="text-base-content block text-xs font-semibold"
              >默认解析策略 (Strategy)</label
            >
            <select
              v-model="dnsStrategy"
              class="select select-bordered select-xs mt-1 w-40 font-mono"
            >
              <option value="prefer_ipv4">prefer_ipv4 (优先 IPv4)</option>
              <option value="prefer_ipv6">prefer_ipv6 (优先 IPv6)</option>
              <option value="ipv4_only">ipv4_only (仅 IPv4)</option>
              <option value="ipv6_only">ipv6_only (仅 IPv6)</option>
            </select>
          </div>

          <div>
            <label class="text-base-content block text-xs font-semibold"
              >兜底默认服务器 (Final Server)</label
            >
            <select
              v-model="dnsFinal"
              class="select select-bordered select-xs mt-1 w-44 font-mono"
            >
              <option
                v-for="s in servers"
                :key="s.tag"
                :value="s.tag"
              >
                {{ s.tag }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <!-- Servers Table -->
      <div class="base-container overflow-hidden">
        <div class="overflow-x-auto">
          <table class="table-sm table">
            <thead>
              <tr class="bg-base-200/50 text-base-content/70 text-xs">
                <th>服务器标识 (Tag)</th>
                <th>服务器地址 (Address)</th>
                <th>解析策略</th>
                <th>出站路由 (Detour)</th>
                <th>基础解析器 (Resolver)</th>
                <th>EDNS Client Subnet</th>
                <th class="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="srv in servers"
                :key="srv.id"
                class="hover:bg-base-200/30 transition-colors"
              >
                <!-- Tag -->
                <td>
                  <div
                    class="text-base-content flex items-center gap-2 font-mono text-xs font-bold"
                  >
                    <span class="badge badge-info badge-xs">DNS</span>
                    {{ srv.tag }}
                  </div>
                </td>

                <!-- Address -->
                <td>
                  <span class="text-primary font-mono text-xs font-medium">
                    {{ srv.address }}
                  </span>
                </td>

                <!-- Strategy -->
                <td>
                  <span class="badge badge-ghost badge-xs font-mono">
                    {{ srv.address_strategy || srv.strategy || 'default' }}
                  </span>
                </td>

                <!-- Detour -->
                <td>
                  <span
                    v-if="srv.detour"
                    class="badge badge-secondary badge-outline badge-xs font-mono"
                  >
                    ➔ {{ srv.detour }}
                  </span>
                  <span
                    v-else
                    class="text-base-content/40 text-[11px]"
                  >
                    Direct
                  </span>
                </td>

                <!-- Address Resolver -->
                <td>
                  <span class="text-base-content/70 font-mono text-xs">
                    {{ srv.address_resolver || '-' }}
                  </span>
                </td>

                <!-- Client Subnet -->
                <td>
                  <span class="text-base-content/70 font-mono text-xs">
                    {{ srv.client_subnet || '-' }}
                  </span>
                </td>

                <!-- Actions -->
                <td class="text-right">
                  <div class="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs text-primary"
                      @click="editServer(srv)"
                    >
                      <PencilSquareIcon class="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs text-error hover:bg-error/10"
                      @click="deleteServer(srv.id)"
                    >
                      <TrashIcon class="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 2: DNS RULES -->
    <div
      v-else
      class="flex flex-col gap-4"
    >
      <div class="base-container overflow-hidden">
        <div class="overflow-x-auto">
          <table class="table-sm table">
            <thead>
              <tr class="bg-base-200/50 text-base-content/70 text-xs">
                <th class="w-12">排序</th>
                <th class="w-16">状态</th>
                <th>匹配域名与条件</th>
                <th>目标 DNS 服务器</th>
                <th>禁用缓存</th>
                <th>说明备注</th>
                <th class="w-24 text-right">操作</th>
              </tr>
            </thead>
            <Draggable
              v-model="rules"
              tag="tbody"
              :animation="150"
              ghost-class="opacity-50"
              handle=".drag-handle"
              item-key="id"
            >
              <template #item="{ element: r, index }">
                <tr class="hover:bg-base-200/30 transition-colors">
                  <!-- Rank -->
                  <td>
                    <div class="flex items-center gap-1.5">
                      <Bars3Icon
                        class="drag-handle text-base-content/40 hover:text-base-content h-4 w-4 shrink-0 cursor-move"
                      />
                      <span class="badge badge-ghost badge-xs font-mono font-bold">
                        #{{ index + 1 }}
                      </span>
                    </div>
                  </td>

                  <!-- Enabled Toggle -->
                  <td>
                    <input
                      v-model="r.enabled"
                      type="checkbox"
                      class="toggle toggle-info toggle-xs"
                    />
                  </td>

                  <!-- Domain Conditions -->
                  <td>
                    <div class="flex flex-wrap items-center gap-1">
                      <span
                        v-if="r.invert"
                        class="badge badge-warning badge-xs font-bold"
                      >
                        ! NOT
                      </span>
                      <span
                        v-for="site in r.geosite || []"
                        :key="site"
                        class="badge badge-primary badge-outline badge-xs font-mono"
                      >
                        geosite:{{ site }}
                      </span>
                      <span
                        v-for="dom in r.domain_suffix || []"
                        :key="dom"
                        class="badge badge-secondary badge-outline badge-xs font-mono"
                      >
                        domain:*.{{ dom }}
                      </span>
                      <span
                        v-for="rs in r.rule_set || []"
                        :key="rs"
                        class="badge badge-info badge-outline badge-xs font-mono"
                      >
                        rule-set:{{ rs }}
                      </span>
                    </div>
                  </td>

                  <!-- Target Server -->
                  <td>
                    <span class="badge badge-info badge-sm font-mono font-bold">
                      ➔ {{ r.server }}
                    </span>
                  </td>

                  <!-- Disable Cache -->
                  <td>
                    <span
                      v-if="r.disable_cache"
                      class="badge badge-warning badge-xs"
                    >
                      禁用 (Disabled)
                    </span>
                    <span
                      v-else
                      class="text-base-content/40 text-xs"
                    >
                      启用
                    </span>
                  </td>

                  <!-- Description -->
                  <td>
                    <span class="text-base-content/70 text-xs">
                      {{ r.description || '-' }}
                    </span>
                  </td>

                  <!-- Actions -->
                  <td class="text-right">
                    <div class="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs text-primary"
                        @click="editRule(r)"
                      >
                        <PencilSquareIcon class="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        class="btn btn-ghost btn-xs text-error hover:bg-error/10"
                        @click="deleteRule(r.id)"
                      >
                        <TrashIcon class="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              </template>
            </Draggable>
          </table>
        </div>
      </div>
    </div>

    <!-- Server Edit Modal -->
    <div
      v-if="serverModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
    >
      <div class="base-container border-base-300 w-full max-w-lg border p-6 shadow-2xl">
        <h3 class="mb-4 text-base font-bold">
          {{ isEditingServer ? '编辑 DNS 服务器' : '添加 DNS 服务器' }}
        </h3>
        <form
          class="flex flex-col gap-3"
          @submit.prevent="saveServer"
        >
          <div>
            <label class="label text-base-content/70 text-xs font-semibold"
              >服务器标识 (Tag) *</label
            >
            <input
              v-model="serverForm.tag"
              type="text"
              required
              class="input input-bordered input-sm w-full font-mono"
              placeholder="例: dns-remote / dns-direct"
            />
          </div>
          <div>
            <label class="label text-base-content/70 text-xs font-semibold"
              >服务器地址 (Address URL/IP) *</label
            >
            <input
              v-model="serverForm.address"
              type="text"
              required
              class="input input-bordered input-sm w-full font-mono"
              placeholder="例: https://1.1.1.1/dns-query 或 local 或 rcode://success"
            />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label text-base-content/70 text-xs font-semibold">解析策略</label>
              <select
                v-model="serverForm.address_strategy"
                class="select select-bordered select-sm w-full font-mono"
              >
                <option value="prefer_ipv4">prefer_ipv4</option>
                <option value="prefer_ipv6">prefer_ipv6</option>
                <option value="ipv4_only">ipv4_only</option>
                <option value="ipv6_only">ipv6_only</option>
              </select>
            </div>
            <div>
              <label class="label text-base-content/70 text-xs font-semibold">出站 Detour</label>
              <input
                v-model="serverForm.detour"
                type="text"
                class="input input-bordered input-sm w-full font-mono"
                placeholder="DIRECT / 代理组名"
              />
            </div>
          </div>
          <div>
            <label class="label text-base-content/70 text-xs font-semibold"
              >Address Resolver (前置解析器)</label
            >
            <input
              v-model="serverForm.address_resolver"
              type="text"
              class="input input-bordered input-sm w-full font-mono"
              placeholder="dns-direct"
            />
          </div>
          <div class="mt-4 flex justify-end gap-2">
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              @click="serverModalOpen = false"
            >
              取消
            </button>
            <button
              type="submit"
              class="btn btn-primary btn-sm"
            >
              保存服务器
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- DNS Rule Edit Modal -->
    <div
      v-if="ruleModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
    >
      <div class="base-container border-base-300 w-full max-w-lg border p-6 shadow-2xl">
        <h3 class="mb-4 text-base font-bold">
          {{ isEditingRule ? '编辑 DNS 分流规则' : '添加 DNS 分流规则' }}
        </h3>
        <form
          class="flex flex-col gap-3"
          @submit.prevent="saveRule"
        >
          <div>
            <label class="label text-base-content/70 text-xs font-semibold"
              >目标 DNS 服务器 (Target Server) *</label
            >
            <select
              v-model="ruleForm.server"
              required
              class="select select-bordered select-sm w-full font-mono font-semibold"
            >
              <option
                v-for="s in servers"
                :key="s.tag"
                :value="s.tag"
              >
                {{ s.tag }} ({{ s.address }})
              </option>
            </select>
          </div>
          <div>
            <label class="label text-base-content/70 text-xs font-semibold"
              >GeoSite 规则集 (逗号分隔)</label
            >
            <input
              v-model="dnsGeositeInput"
              type="text"
              class="input input-bordered input-sm w-full font-mono"
              placeholder="category-ads-all, cn"
            />
          </div>
          <div>
            <label class="label text-base-content/70 text-xs font-semibold"
              >域名后缀 (逗号分隔)</label
            >
            <input
              v-model="dnsDomainSuffixInput"
              type="text"
              class="input input-bordered input-sm w-full font-mono"
              placeholder="google.com, apple.com"
            />
          </div>
          <div>
            <label class="label text-base-content/70 text-xs font-semibold"
              >Rule-Set 远程规则集</label
            >
            <input
              v-model="dnsRuleSetInput"
              type="text"
              class="input input-bordered input-sm w-full font-mono"
              placeholder="geosite-cn"
            />
          </div>
          <div class="flex items-center gap-4 py-1">
            <label class="flex cursor-pointer items-center gap-2 text-xs">
              <input
                v-model="ruleForm.disable_cache"
                type="checkbox"
                class="toggle toggle-warning toggle-xs"
              />
              禁用缓存 (Disable Cache)
            </label>
            <label class="flex cursor-pointer items-center gap-2 text-xs">
              <input
                v-model="ruleForm.invert"
                type="checkbox"
                class="toggle toggle-info toggle-xs"
              />
              取反匹配 (Invert)
            </label>
          </div>
          <div>
            <label class="label text-base-content/70 text-xs font-semibold">规则说明</label>
            <input
              v-model="ruleForm.description"
              type="text"
              class="input input-bordered input-sm w-full"
              placeholder="例: 广告域名拦截"
            />
          </div>
          <div class="mt-4 flex justify-end gap-2">
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              @click="ruleModalOpen = false"
            >
              取消
            </button>
            <button
              type="submit"
              class="btn btn-primary btn-sm"
            >
              保存规则
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DnsRule, DnsServer } from '@/api/config/types'
import { showNotification } from '@/helper/notification'
import { draftState } from '@/store/configDraft'
import {
  Bars3Icon,
  PencilSquareIcon,
  PlusIcon,
  ServerStackIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline'
import { computed, reactive, ref } from 'vue'
import Draggable from 'vuedraggable'

defineOptions({ name: 'ConfigDns' })
const activeTab = ref<'servers' | 'rules'>('servers')

const servers = computed({
  get: () => draftState.dns.servers || [],
  set: (val: DnsServer[]) => {
    draftState.dns.servers = val
  },
})

const rules = computed({
  get: () => draftState.dns.rules || [],
  set: (val: DnsRule[]) => {
    val.forEach((r, idx) => {
      r.priority = idx + 1
    })
    draftState.dns.rules = val
  },
})

const dnsStrategy = computed({
  get: () => draftState.dns.strategy || 'prefer_ipv4',
  set: (val: string) => {
    draftState.dns.strategy = val
  },
})

const dnsFinal = computed({
  get: () => draftState.dns.final || (servers.value[0]?.tag ?? 'dns-remote'),
  set: (val: string) => {
    draftState.dns.final = val
  },
})

// Server Modal State
const serverModalOpen = ref(false)
const isEditingServer = ref(false)
const serverForm = reactive<DnsServer>({
  id: '',
  tag: '',
  address: '',
  address_strategy: 'prefer_ipv4',
  detour: '',
  address_resolver: '',
})

// Rule Modal State
const ruleModalOpen = ref(false)
const isEditingRule = ref(false)
const dnsGeositeInput = ref('')
const dnsDomainSuffixInput = ref('')
const dnsRuleSetInput = ref('')

const ruleForm = reactive<DnsRule>({
  id: '',
  priority: 1,
  enabled: true,
  server: '',
  disable_cache: false,
  invert: false,
  description: '',
})

const openAddModal = () => {
  if (activeTab.value === 'servers') {
    isEditingServer.value = false
    serverForm.id = `dns_${Date.now()}`
    serverForm.tag = ''
    serverForm.address = ''
    serverForm.address_strategy = 'prefer_ipv4'
    serverForm.detour = ''
    serverForm.address_resolver = ''
    serverModalOpen.value = true
  } else {
    isEditingRule.value = false
    ruleForm.id = `dns_rule_${Date.now()}`
    ruleForm.priority = rules.value.length + 1
    ruleForm.enabled = true
    ruleForm.server = servers.value[0]?.tag || 'dns-remote'
    ruleForm.disable_cache = false
    ruleForm.invert = false
    ruleForm.description = ''
    dnsGeositeInput.value = ''
    dnsDomainSuffixInput.value = ''
    dnsRuleSetInput.value = ''
    ruleModalOpen.value = true
  }
}

const editServer = (s: DnsServer) => {
  isEditingServer.value = true
  Object.assign(serverForm, JSON.parse(JSON.stringify(s)))
  serverModalOpen.value = true
}

const saveServer = () => {
  if (!serverForm.tag || !serverForm.address) return
  const idx = draftState.dns.servers.findIndex((s) => s.id === serverForm.id)
  if (idx > -1) {
    draftState.dns.servers[idx] = { ...serverForm }
    showNotification({ content: `Updated DNS server: ${serverForm.tag}`, type: 'alert-success' })
  } else {
    draftState.dns.servers.push({ ...serverForm })
    showNotification({ content: `Added DNS server: ${serverForm.tag}`, type: 'alert-success' })
  }
  serverModalOpen.value = false
}

const deleteServer = (id: string) => {
  const idx = draftState.dns.servers.findIndex((s) => s.id === id)
  if (idx > -1) {
    draftState.dns.servers.splice(idx, 1)
    showNotification({ content: 'Deleted DNS server', type: 'alert-info' })
  }
}

const editRule = (r: DnsRule) => {
  isEditingRule.value = true
  Object.assign(ruleForm, JSON.parse(JSON.stringify(r)))
  dnsGeositeInput.value = (r.geosite || []).join(', ')
  dnsDomainSuffixInput.value = (r.domain_suffix || []).join(', ')
  dnsRuleSetInput.value = (r.rule_set || []).join(', ')
  ruleModalOpen.value = true
}

const saveRule = () => {
  ruleForm.geosite = dnsGeositeInput.value
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean)
  ruleForm.domain_suffix = dnsDomainSuffixInput.value
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean)
  ruleForm.rule_set = dnsRuleSetInput.value
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean)
  const idx = draftState.dns.rules.findIndex((r) => r.id === ruleForm.id)
  if (idx > -1) {
    draftState.dns.rules[idx] = { ...ruleForm }
    showNotification({ content: `Updated DNS rule #${ruleForm.priority}`, type: 'alert-success' })
  } else {
    draftState.dns.rules.push({ ...ruleForm })
    showNotification({ content: `Added DNS rule #${ruleForm.priority}`, type: 'alert-success' })
  }
  ruleModalOpen.value = false
}

const deleteRule = (id: string) => {
  const idx = draftState.dns.rules.findIndex((r) => r.id === id)
  if (idx > -1) {
    draftState.dns.rules.splice(idx, 1)
    draftState.dns.rules.forEach((item, index) => {
      item.priority = index + 1
    })
    showNotification({ content: 'Deleted DNS rule', type: 'alert-info' })
  }
}
</script>
