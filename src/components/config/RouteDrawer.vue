<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs transition-opacity"
    @click.self="close"
  >
    <div
      class="border-base-300/80 bg-base-100 flex h-full w-full max-w-2xl flex-col border-l shadow-2xl transition-transform duration-300"
    >
      <!-- Header -->
      <div class="border-base-300/80 flex items-center justify-between border-b px-6 py-4">
        <div class="flex items-center gap-2">
          <div class="bg-accent/10 text-accent rounded-xl p-2">
            <ArrowsRightLeftIcon class="h-5 w-5" />
          </div>
          <div>
            <h3 class="text-base-content text-base font-semibold">
              {{
                isEditing
                  ? '编辑路由分流规则 (Edit Route Rule)'
                  : '添加路由分流规则 (New Route Rule)'
              }}
            </h3>
            <p class="text-base-content/60 text-xs">
              设置域名、GeoSite/GeoIP、IP-CIDR、端口与进程匹配条件与出站动作
            </p>
          </div>
        </div>
        <button
          type="button"
          class="btn btn-ghost btn-sm btn-circle"
          @click="close"
        >
          <XMarkIcon class="h-5 w-5" />
        </button>
      </div>

      <!-- Content Area -->
      <div class="flex-1 overflow-y-auto p-6">
        <form
          class="flex flex-col gap-4"
          @submit.prevent="save"
        >
          <!-- Priority & Status -->
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label class="label text-base-content/70 text-xs font-semibold">
                优先级序号 (Priority)
              </label>
              <input
                v-model.number="form.priority"
                type="number"
                min="1"
                class="input input-bordered input-sm w-full font-mono font-semibold"
              />
            </div>
            <div>
              <label class="label text-base-content/70 text-xs font-semibold">
                出站动作 (Action) *
              </label>
              <select
                v-model="form.action"
                class="select select-bordered select-sm w-full font-semibold"
              >
                <option value="route">Route (路由到出站项)</option>
                <option value="direct">Direct (直连访问)</option>
                <option value="reject">Reject (拒绝/拦截)</option>
                <option value="sniff">Sniff (协议嗅探)</option>
                <option value="resolve">Resolve (仅DNS解析)</option>
              </select>
            </div>
            <div>
              <label class="label text-base-content/70 text-xs font-semibold">
                规则开关 (Enabled)
              </label>
              <div class="flex h-9 items-center gap-2">
                <input
                  v-model="form.enabled"
                  type="checkbox"
                  class="toggle toggle-primary toggle-sm"
                />
                <span class="text-xs">{{ form.enabled ? '生效中' : '已禁用' }}</span>
              </div>
            </div>
          </div>

          <!-- Target Outbound (when action === 'route') -->
          <div v-if="form.action === 'route'">
            <label class="label text-base-content/70 text-xs font-semibold">
              目标出站组 / 节点 (Target Outbound) *
            </label>
            <select
              v-model="form.outbound"
              class="select select-bordered select-sm w-full font-medium"
            >
              <option value="">-- 请选择目标出站 --</option>
              <option
                v-for="grp in groupOptions"
                :key="grp"
                :value="grp"
              >
                {{ grp }}
              </option>
              <option value="DIRECT">DIRECT (直连)</option>
              <option value="REJECT">REJECT (拒绝)</option>
            </select>
          </div>

          <!-- Description -->
          <div>
            <label class="label text-base-content/70 text-xs font-semibold">
              规则说明 (Description)
            </label>
            <input
              v-model="form.description"
              type="text"
              class="input input-bordered input-sm w-full"
              placeholder="例: 国内流媒体直连 / AI工具分流"
            />
          </div>

          <!-- Invert Match Toggle -->
          <div
            class="border-base-300/80 bg-base-200/40 flex items-center gap-3 rounded-lg border p-3"
          >
            <input
              v-model="form.invert"
              type="checkbox"
              class="toggle toggle-warning toggle-xs"
            />
            <div>
              <div class="text-base-content text-xs font-semibold">取反匹配 (Invert Match)</div>
              <div class="text-base-content/60 text-[11px]">
                勾选后，仅当流量不满足下列所有条件时才触发此规则动作
              </div>
            </div>
          </div>

          <!-- Match Conditions Section -->
          <div class="rounded-box border-base-300/80 bg-base-200/40 border p-4">
            <h4 class="text-base-content/70 mb-3 text-xs font-bold tracking-wider uppercase">
              匹配条件清单 (Matching Criteria)
            </h4>

            <!-- GeoSite Tags -->
            <div class="mb-3">
              <label class="label text-base-content/70 text-[11px] font-semibold">
                GeoSite 规则集 (以逗号分隔，如: category-ads-all, cn, openai)
              </label>
              <input
                v-model="geositeInput"
                type="text"
                class="input input-bordered input-xs w-full font-mono"
                placeholder="category-ads-all, cn, openai, github"
                @change="updateGeosite"
              />
            </div>

            <!-- Domain / Domain Suffix -->
            <div class="mb-3">
              <label class="label text-base-content/70 text-[11px] font-semibold">
                域名后缀 (Domain Suffix，如: google.com, apple.com)
              </label>
              <input
                v-model="domainSuffixInput"
                type="text"
                class="input input-bordered input-xs w-full font-mono"
                placeholder="google.com, apple.com, openai.com"
                @change="updateDomainSuffix"
              />
            </div>

            <!-- GeoIP Tags -->
            <div class="mb-3">
              <label class="label text-base-content/70 text-[11px] font-semibold">
                GeoIP 区域 (如: cn, private, hk)
              </label>
              <input
                v-model="geoipInput"
                type="text"
                class="input input-bordered input-xs w-full font-mono"
                placeholder="cn, private, hk"
                @change="updateGeoip"
              />
            </div>

            <!-- IP CIDR -->
            <div class="mb-3">
              <label class="label text-base-content/70 text-[11px] font-semibold">
                IP-CIDR 地址段 (如: 192.168.0.0/16, 10.0.0.0/8)
              </label>
              <input
                v-model="ipCidrInput"
                type="text"
                class="input input-bordered input-xs w-full font-mono"
                placeholder="192.168.0.0/16, 10.0.0.0/8"
                @change="updateIpCidr"
              />
            </div>

            <!-- Ports -->
            <div class="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label class="label text-base-content/70 text-[11px] font-semibold">
                  端口号 (Port，逗号分隔，如: 80, 443)
                </label>
                <input
                  v-model="portInput"
                  type="text"
                  class="input input-bordered input-xs w-full font-mono"
                  placeholder="80, 443, 8080"
                  @change="updatePort"
                />
              </div>
              <div>
                <label class="label text-base-content/70 text-[11px] font-semibold">
                  协议 (Protocol，如: tcp, udp)
                </label>
                <input
                  v-model="protocolInput"
                  type="text"
                  class="input input-bordered input-xs w-full font-mono"
                  placeholder="tcp, udp"
                  @change="updateProtocol"
                />
              </div>
            </div>

            <!-- Process & Rule Set -->
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label class="label text-base-content/70 text-[11px] font-semibold">
                  进程名 (Process Name)
                </label>
                <input
                  v-model="processNameInput"
                  type="text"
                  class="input input-bordered input-xs w-full font-mono"
                  placeholder="Telegram, curl, git"
                  @change="updateProcessName"
                />
              </div>
              <div>
                <label class="label text-base-content/70 text-[11px] font-semibold">
                  Rule-Set 远程规则集
                </label>
                <input
                  v-model="ruleSetInput"
                  type="text"
                  class="input input-bordered input-xs w-full font-mono"
                  placeholder="geosite-geolocation-!cn"
                  @change="updateRuleSet"
                />
              </div>
            </div>
          </div>

          <!-- Live Rule JSON Representation -->
          <div class="rounded-box border-base-300/80 bg-base-200/70 border p-4">
            <span class="text-base-content mb-2 block text-xs font-semibold">
              Sing-box 规则 JSON 预览 (Compiled Rule Snippet)
            </span>
            <pre
              class="bg-neutral text-neutral-content overflow-x-auto rounded p-3 font-mono text-[11px] leading-relaxed"
              >{{ compiledRuleJson }}</pre
            >
          </div>
        </form>
      </div>

      <!-- Footer Actions -->
      <div class="border-base-300/80 flex items-center justify-end gap-2 border-t px-6 py-4">
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          @click="close"
        >
          取消 (Cancel)
        </button>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          @click="save"
        >
          保存规则 (Save Rule)
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { RouteRule } from '@/api/config/types'
import { showNotification } from '@/helper/notification'
import { draftState } from '@/store/configDraft'
import { ArrowsRightLeftIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { computed, reactive, ref, watch } from 'vue'

const props = defineProps<{
  modelValue: boolean
  rule?: RouteRule | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'save', rule: RouteRule): void
}>()

const isOpen = ref(false)
const isEditing = ref(false)

const geositeInput = ref('')
const domainSuffixInput = ref('')
const geoipInput = ref('')
const ipCidrInput = ref('')
const portInput = ref('')
const protocolInput = ref('')
const processNameInput = ref('')
const ruleSetInput = ref('')

const groupOptions = computed(() => {
  return (draftState.groups || []).map((g) => g.name)
})

const form = reactive<RouteRule>({
  id: '',
  priority: 1,
  enabled: true,
  action: 'route',
  outbound: '',
  description: '',
  invert: false,
})

watch(
  () => props.modelValue,
  (val) => {
    isOpen.value = val
    if (val) {
      if (props.rule) {
        isEditing.value = true
        Object.assign(form, JSON.parse(JSON.stringify(props.rule)))
      } else {
        isEditing.value = false
        form.id = `rule_${Date.now()}`
        form.priority = (draftState.routes.rules?.length || 0) + 1
        form.enabled = true
        form.action = 'route'
        form.outbound = groupOptions.value[0] || 'DIRECT'
        form.description = ''
        form.invert = false
        form.geosite = []
        form.domain_suffix = []
        form.geoip = []
        form.ip_cidr = []
        form.port = []
        form.protocol = []
        form.process_name = []
        form.rule_set = []
      }

      geositeInput.value = (form.geosite || []).join(', ')
      domainSuffixInput.value = (form.domain_suffix || []).join(', ')
      geoipInput.value = (form.geoip || []).join(', ')
      ipCidrInput.value = (form.ip_cidr || []).join(', ')
      portInput.value = (form.port || []).join(', ')
      protocolInput.value = (form.protocol || []).join(', ')
      processNameInput.value = (form.process_name || []).join(', ')
      ruleSetInput.value = (form.rule_set || []).join(', ')
    }
  },
  { immediate: true },
)

const updateGeosite = () => {
  form.geosite = parseCommaList(geositeInput.value)
}
const updateDomainSuffix = () => {
  form.domain_suffix = parseCommaList(domainSuffixInput.value)
}
const updateGeoip = () => {
  form.geoip = parseCommaList(geoipInput.value)
}
const updateIpCidr = () => {
  form.ip_cidr = parseCommaList(ipCidrInput.value)
}
const updatePort = () => {
  form.port = parseCommaList(portInput.value)
    .map(Number)
    .filter((n) => !isNaN(n))
}
const updateProtocol = () => {
  form.protocol = parseCommaList(protocolInput.value)
}
const updateProcessName = () => {
  form.process_name = parseCommaList(processNameInput.value)
}
const updateRuleSet = () => {
  form.rule_set = parseCommaList(ruleSetInput.value)
}

function parseCommaList(str: string): string[] {
  return str
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

const compiledRuleJson = computed(() => {
  const ruleObj: Record<string, unknown> = {
    action: form.action,
  }
  if (form.action === 'route' && form.outbound) {
    ruleObj.outbound = form.outbound
  }
  if (form.geosite && form.geosite.length > 0) ruleObj.geosite = form.geosite
  if (form.domain_suffix && form.domain_suffix.length > 0)
    ruleObj.domain_suffix = form.domain_suffix
  if (form.geoip && form.geoip.length > 0) ruleObj.geoip = form.geoip
  if (form.ip_cidr && form.ip_cidr.length > 0) ruleObj.ip_cidr = form.ip_cidr
  if (form.port && form.port.length > 0) ruleObj.port = form.port
  if (form.protocol && form.protocol.length > 0) ruleObj.protocol = form.protocol
  if (form.process_name && form.process_name.length > 0) ruleObj.process_name = form.process_name
  if (form.rule_set && form.rule_set.length > 0) ruleObj.rule_set = form.rule_set
  if (form.invert) ruleObj.invert = true

  return JSON.stringify(ruleObj, null, 2)
})

const close = () => {
  isOpen.value = false
  emit('update:modelValue', false)
}

const save = () => {
  if (form.action === 'route' && !form.outbound) {
    showNotification({
      content: 'Please choose target outbound',
      type: 'alert-warning',
    })
    return
  }
  updateGeosite()
  updateDomainSuffix()
  updateGeoip()
  updateIpCidr()
  updatePort()
  updateProtocol()
  updateProcessName()
  updateRuleSet()

  emit('save', JSON.parse(JSON.stringify(form)))
  close()
}
</script>
