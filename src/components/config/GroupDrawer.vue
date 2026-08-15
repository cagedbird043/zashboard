<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs transition-opacity"
    @click.self="close"
  >
    <div
      class="border-base-300/80 bg-base-100 flex h-full w-full max-w-3xl flex-col border-l shadow-2xl transition-transform duration-300"
    >
      <!-- Header -->
      <div class="border-base-300/80 flex items-center justify-between border-b px-6 py-4">
        <div class="flex items-center gap-2">
          <div class="bg-secondary/10 text-secondary rounded-xl p-2">
            <RectangleStackIcon class="h-5 w-5" />
          </div>
          <div>
            <h3 class="text-base-content text-base font-semibold">
              {{ isEditing ? '编辑出站分组 (Edit Group)' : '新建出站分组 (New Outbound Group)' }}
            </h3>
            <p class="text-base-content/60 text-xs">
              配置出站组策略、包含的订阅源、Home Assistant 风格节点过滤与测速参数
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

      <!-- Content Area with Tabs or Sections -->
      <div class="flex-1 overflow-y-auto p-6">
        <form
          class="flex flex-col gap-5"
          @submit.prevent="save"
        >
          <!-- Basic Info -->
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div class="sm:col-span-2">
              <label class="label text-base-content/70 text-xs font-semibold">
                出站分组名称 (Group Tag) *
              </label>
              <input
                v-model="form.name"
                type="text"
                required
                class="input input-bordered input-sm w-full font-medium"
                placeholder="例: 🇭🇰 香港自动 / 🚀 节点选择"
              />
            </div>
            <div>
              <label class="label text-base-content/70 text-xs font-semibold">
                分组类型 (Type)
              </label>
              <select
                v-model="form.type"
                class="select select-bordered select-sm w-full font-medium"
              >
                <option value="selector">Selector (手动选择)</option>
                <option value="urltest">URLTest (自动测速优选)</option>
                <option value="fallback">Fallback (故障转移)</option>
                <option value="loadbalance">LoadBalance (负载均衡)</option>
              </select>
            </div>
          </div>

          <!-- Description -->
          <div>
            <label class="label text-base-content/70 text-xs font-semibold">
              说明备注 (Description)
            </label>
            <input
              v-model="form.description"
              type="text"
              class="input input-bordered input-sm w-full"
              placeholder="例: 自动优选延迟最低的香港 BGP 节点"
            />
          </div>

          <!-- Providers Selection -->
          <div class="rounded-box border-base-300/80 bg-base-200/40 border p-4">
            <label class="text-base-content mb-2 block text-xs font-semibold">
              包含的订阅源 (Source Providers)
            </label>
            <div class="flex flex-wrap gap-2">
              <label
                v-for="prov in availableProviders"
                :key="prov.id"
                class="label border-base-300 bg-base-100 hover:border-primary/50 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 shadow-xs transition-colors"
                :class="form.providers?.includes(prov.id) ? 'border-primary bg-primary/5' : ''"
              >
                <input
                  type="checkbox"
                  class="checkbox checkbox-primary checkbox-xs"
                  :checked="form.providers?.includes(prov.id)"
                  @change="toggleProvider(prov.id)"
                />
                <span class="text-xs font-medium">{{ prov.name }}</span>
                <span class="badge badge-ghost badge-xs">{{ prov.node_count || 0 }} 节点</span>
              </label>
            </div>
          </div>

          <!-- Static Outbounds (for Selector or Fallback) -->
          <div class="rounded-box border-base-300/80 bg-base-200/40 border p-4">
            <label class="text-base-content mb-2 block text-xs font-semibold">
              静态/固定出站项 (Static Outbounds)
            </label>
            <div class="flex flex-wrap items-center gap-1.5">
              <span
                v-for="(out, idx) in form.outbounds"
                :key="idx"
                class="badge badge-primary badge-sm gap-1"
              >
                {{ out }}
                <XMarkIcon
                  class="h-3 w-3 cursor-pointer"
                  @click="removeOutbound(idx)"
                />
              </span>
              <div class="join">
                <input
                  v-model="newOutboundInput"
                  type="text"
                  class="input input-bordered input-xs join-item w-36"
                  placeholder="DIRECT / 其它组"
                  @keydown.enter.prevent="addOutbound"
                />
                <button
                  type="button"
                  class="btn btn-primary btn-xs join-item"
                  @click="addOutbound"
                >
                  添加
                </button>
              </div>
            </div>
          </div>

          <!-- Home Assistant Style Condition Builder -->
          <div class="rounded-box border-primary/30 bg-base-100 border p-4 shadow-xs">
            <div class="mb-3 flex items-center justify-between">
              <div>
                <h4 class="text-primary text-xs font-bold tracking-wide uppercase">
                  Home Assistant 风格节点过滤 (Condition Filter)
                </h4>
                <p class="text-base-content/60 text-[11px]">
                  按节点名称、协议或服务器设置动态匹配条件，实时编译为 sing-box 正则
                </p>
              </div>
            </div>
            <ConditionBuilder
              v-if="form.filter"
              v-model="form.filter"
            />
          </div>

          <!-- URLTest / Fallback Specific Settings -->
          <div
            v-if="form.type === 'urltest' || form.type === 'fallback'"
            class="rounded-box border-base-300/80 bg-base-200/40 border p-4"
          >
            <h4 class="text-base-content mb-3 text-xs font-bold">
              测速与容差参数 (URLTest / Health Check)
            </h4>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div class="sm:col-span-2">
                <label class="label text-base-content/60 text-[11px]">测速地址 (URL)</label>
                <input
                  v-model="form.url"
                  type="text"
                  class="input input-bordered input-xs w-full font-mono"
                  placeholder="https://www.gstatic.com/generate_204"
                />
              </div>
              <div>
                <label class="label text-base-content/60 text-[11px]">测速间隔 (Interval)</label>
                <input
                  v-model="form.interval"
                  type="text"
                  class="input input-bordered input-xs w-full font-mono"
                  placeholder="5m"
                />
              </div>
              <div>
                <label class="label text-base-content/60 text-[11px]"
                  >容差毫秒 (Tolerance ms)</label
                >
                <input
                  v-model.number="form.tolerance"
                  type="number"
                  class="input input-bordered input-xs w-full font-mono"
                  placeholder="50"
                />
              </div>
              <div class="flex items-center gap-2 pt-4 sm:col-span-2">
                <input
                  v-model="form.interrupt_exist_connections"
                  type="checkbox"
                  class="toggle toggle-xs"
                />
                <span class="text-base-content/80 text-xs"
                  >节点切换时中断已有连接 (Interrupt Exist Connections)</span
                >
              </div>
            </div>
          </div>

          <!-- Live Compiled Sing-box Outbound JSONC Snippet -->
          <div class="rounded-box border-base-300/80 bg-base-200/70 border p-4">
            <div class="mb-2 flex items-center justify-between">
              <span class="text-base-content text-xs font-semibold">
                Sing-box 编译配置预览 (Compiled Outbound Snippet)
              </span>
              <button
                type="button"
                class="btn btn-ghost btn-xs text-primary"
                @click="copySnippet"
              >
                <DocumentDuplicateIcon class="h-3.5 w-3.5" />
                复制 JSONC
              </button>
            </div>
            <pre
              class="bg-neutral text-neutral-content overflow-x-auto rounded p-3 font-mono text-[11px] leading-relaxed"
              >{{ compiledSnippet }}</pre
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
          保存分组 (Save Group)
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Group, Provider } from '@/api/config/types'
import { showNotification } from '@/helper/notification'
import { compileConditionNode, draftState } from '@/store/configDraft'
import { DocumentDuplicateIcon, RectangleStackIcon, XMarkIcon } from '@heroicons/vue/24/outline'
import { computed, reactive, ref, watch } from 'vue'
import ConditionBuilder from './ConditionBuilder.vue'

const props = defineProps<{
  modelValue: boolean
  group?: Group | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'save', group: Group): void
}>()

const isOpen = ref(false)
const isEditing = ref(false)
const newOutboundInput = ref('')

const availableProviders = computed<Provider[]>(() => draftState.providers || [])

const form = reactive<Group>({
  id: '',
  name: '',
  type: 'selector',
  outbounds: [],
  providers: [],
  filter: {
    logic: 'and',
    conditions: [{ field: 'name', op: 'contains', value: '' }],
  },
  url: 'https://www.gstatic.com/generate_204',
  interval: '5m',
  tolerance: 50,
  interrupt_exist_connections: false,
  description: '',
})

watch(
  () => props.modelValue,
  (val) => {
    isOpen.value = val
    if (val) {
      if (props.group) {
        isEditing.value = true
        Object.assign(form, JSON.parse(JSON.stringify(props.group)))
        if (!form.filter) {
          form.filter = {
            logic: 'and',
            conditions: [{ field: 'name', op: 'contains', value: '' }],
          }
        }
        if (!form.providers) form.providers = []
        if (!form.outbounds) form.outbounds = []
      } else {
        isEditing.value = false
        form.id = `group_${Date.now()}`
        form.name = ''
        form.type = 'urltest'
        form.outbounds = []
        form.providers = availableProviders.value.map((p) => p.id)
        form.filter = {
          logic: 'and',
          conditions: [{ field: 'name', op: 'contains', value: '香港|HK' }],
        }
        form.url = 'https://www.gstatic.com/generate_204'
        form.interval = '5m'
        form.tolerance = 50
        form.interrupt_exist_connections = false
        form.description = ''
      }
    }
  },
  { immediate: true },
)

const compiledSnippet = computed(() => {
  const { includes, excludes } = form.filter
    ? compileConditionNode(form.filter)
    : { includes: [], excludes: [] }

  const outboundObj: Record<string, unknown> = {
    type: form.type,
    tag: form.name || 'group-tag',
  }

  if (form.outbounds && form.outbounds.length > 0) {
    outboundObj.outbounds = form.outbounds
  }
  if (form.providers && form.providers.length > 0) {
    outboundObj.providers = form.providers
  }
  if (includes.length > 0) {
    outboundObj.includes = includes
  }
  if (excludes.length > 0) {
    outboundObj.excludes = excludes
  }
  if (form.type === 'urltest' || form.type === 'fallback') {
    outboundObj.url = form.url || 'https://www.gstatic.com/generate_204'
    outboundObj.interval = form.interval || '5m'
    outboundObj.tolerance = form.tolerance ?? 50
    if (form.interrupt_exist_connections) {
      outboundObj.interrupt_exist_connections = true
    }
  }

  return JSON.stringify(outboundObj, null, 2)
})

const toggleProvider = (provId: string) => {
  if (!form.providers) form.providers = []
  const idx = form.providers.indexOf(provId)
  if (idx > -1) {
    form.providers.splice(idx, 1)
  } else {
    form.providers.push(provId)
  }
}

const addOutbound = () => {
  const trimmed = newOutboundInput.value.trim()
  if (!trimmed) return
  if (!form.outbounds) form.outbounds = []
  if (!form.outbounds.includes(trimmed)) {
    form.outbounds.push(trimmed)
  }
  newOutboundInput.value = ''
}

const removeOutbound = (idx: number) => {
  form.outbounds.splice(idx, 1)
}

const copySnippet = async () => {
  try {
    await navigator.clipboard.writeText(compiledSnippet.value)
    showNotification({
      content: 'Outbound JSONC snippet copied to clipboard',
      type: 'alert-success',
    })
  } catch {
    showNotification({
      content: 'Failed to copy',
      type: 'alert-error',
    })
  }
}

const close = () => {
  isOpen.value = false
  emit('update:modelValue', false)
}

const save = () => {
  if (!form.name) {
    showNotification({
      content: 'Please specify group name',
      type: 'alert-warning',
    })
    return
  }
  const { includes, excludes } = form.filter
    ? compileConditionNode(form.filter)
    : { includes: [], excludes: [] }
  form.includes = includes
  form.excludes = excludes
  emit('save', JSON.parse(JSON.stringify(form)))
  close()
}
</script>
