<template>
  <div class="condition-builder flex flex-col gap-3">
    <div class="rounded-box border-base-300/80 bg-base-200/50 border p-3">
      <!-- Logic Combination Selector -->
      <div
        class="border-base-300/60 flex flex-wrap items-center justify-between gap-2 border-b pb-3"
      >
        <div class="flex items-center gap-2">
          <span class="text-base-content/70 text-xs font-semibold tracking-wider uppercase">
            匹配逻辑 (Logic)
          </span>
          <div class="join">
            <button
              type="button"
              class="btn btn-xs join-item"
              :class="model.logic === 'and' ? 'btn-primary' : 'btn-ghost'"
              @click="setLogic('and')"
            >
              AND (全部满足)
            </button>
            <button
              type="button"
              class="btn btn-xs join-item"
              :class="model.logic === 'or' ? 'btn-primary' : 'btn-ghost'"
              @click="setLogic('or')"
            >
              OR (任意满足)
            </button>
            <button
              type="button"
              class="btn btn-xs join-item"
              :class="model.logic === 'not' ? 'btn-error' : 'btn-ghost'"
              @click="setLogic('not')"
            >
              NOT (排除匹配)
            </button>
          </div>
        </div>

        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="btn btn-ghost btn-xs text-primary"
            @click="addCondition"
          >
            <PlusIcon class="h-3.5 w-3.5" />
            添加条件
          </button>
          <button
            v-if="!isNested"
            type="button"
            class="btn btn-ghost btn-xs text-secondary"
            @click="addGroup"
          >
            <FolderPlusIcon class="h-3.5 w-3.5" />
            添加条件组
          </button>
        </div>
      </div>

      <!-- Condition Rows -->
      <div class="mt-3 flex flex-col gap-2">
        <div
          v-if="!model.conditions || model.conditions.length === 0"
          class="border-base-300 text-base-content/50 flex items-center justify-center rounded-lg border border-dashed py-4 text-xs"
        >
          暂无过滤条件，默认匹配所有节点 (No conditions)
        </div>

        <div
          v-for="(cond, index) in model.conditions"
          :key="cond.id || index"
          class="flex flex-col gap-2"
        >
          <!-- Nested Group -->
          <div
            v-if="isConditionNode(cond)"
            class="border-secondary/30 bg-base-100/70 relative rounded-lg border p-3 pl-4"
          >
            <div class="mb-2 flex items-center justify-between">
              <span class="badge badge-secondary badge-xs font-mono">子条件组 (Nested Group)</span>
              <button
                type="button"
                class="btn btn-ghost btn-xs btn-circle text-error hover:bg-error/10"
                @click="removeCondition(index)"
              >
                <TrashIcon class="h-3.5 w-3.5" />
              </button>
            </div>
            <ConditionBuilder
              :model-value="getNestedGroup(index)"
              :is-nested="true"
              @update:model-value="(val) => updateNestedGroup(index, val)"
            />
          </div>
          <!-- Single Condition Item -->
          <div
            v-else
            class="group border-base-300/60 bg-base-100 hover:border-base-content/20 flex flex-wrap items-center gap-2 rounded-lg border p-2 text-xs shadow-xs transition-all"
          >
            <!-- Field Selector -->
            <select
              v-model="cond.field"
              class="select select-bordered select-xs bg-base-200/50 w-28"
            >
              <option value="name">节点名称 (name)</option>
              <option value="type">协议类型 (type)</option>
              <option value="server">服务器 (server)</option>
              <option value="port">端口号 (port)</option>
            </select>

            <!-- Operator Selector -->
            <select
              v-model="cond.op"
              class="select select-bordered select-xs bg-base-200/50 w-28"
            >
              <option value="contains">包含 (contains)</option>
              <option value="equals">精确匹配 (equals)</option>
              <option value="starts_with">以此开头 (starts_with)</option>
              <option value="ends_with">以此结尾 (ends_with)</option>
              <option value="regex">正则匹配 (regex)</option>
            </select>

            <!-- Value Input -->
            <div class="relative min-w-40 flex-1">
              <input
                v-model="cond.value"
                type="text"
                class="input input-bordered input-xs bg-base-200/30 w-full pr-6 font-mono"
                :placeholder="cond.op === 'regex' ? '例: (?i)HK|Hong Kong' : '例: 香港 | HK'"
              />
              <button
                v-if="cond.value"
                type="button"
                class="text-base-content/40 hover:text-base-content absolute top-1/2 right-1.5 -translate-y-1/2"
                @click="cond.value = ''"
              >
                <XMarkIcon class="h-3 w-3" />
              </button>
            </div>

            <!-- Quick tag helpers -->
            <div
              v-if="cond.field === 'name' && !cond.value"
              class="hidden items-center gap-1 xl:flex"
            >
              <button
                type="button"
                class="badge badge-ghost badge-xs hover:badge-primary cursor-pointer"
                @click="cond.value = '香港|HK'"
              >
                🇭🇰 香港
              </button>
              <button
                type="button"
                class="badge badge-ghost badge-xs hover:badge-primary cursor-pointer"
                @click="cond.value = '日本|JP|Tokyo'"
              >
                🇯🇵 日本
              </button>
              <button
                type="button"
                class="badge badge-ghost badge-xs hover:badge-primary cursor-pointer"
                @click="cond.value = '美国|US'"
              >
                🇺🇸 美国
              </button>
              <button
                type="button"
                class="badge badge-ghost badge-xs hover:badge-primary cursor-pointer"
                @click="cond.value = '新加坡|SG'"
              >
                🇸🇬 新加坡
              </button>
            </div>

            <!-- Delete Condition Row -->
            <button
              type="button"
              class="btn btn-ghost btn-xs btn-circle text-base-content/40 hover:text-error"
              @click="removeCondition(index)"
            >
              <TrashIcon class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Live Compilation & Matching Preview -->
    <div
      v-if="!isNested"
      class="rounded-box border-primary/20 bg-primary/5 border p-3 text-xs"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <SparklesIcon class="text-primary h-4 w-4" />
          <span class="text-primary font-semibold">Sing-box 原生匹配预览 (Live Preview)</span>
        </div>
        <div class="flex items-center gap-2">
          <span
            class="badge badge-sm font-mono"
            :class="matchedSampleNodes.length > 0 ? 'badge-success' : 'badge-ghost'"
          >
            匹配 {{ matchedSampleNodes.length }} / {{ sampleNodes.length }} 个节点
          </span>
        </div>
      </div>

      <!-- Compiled Regex Badge -->
      <div class="mt-2 flex flex-col gap-1 font-mono text-[11px]">
        <div
          v-if="compiledRegex.includes.length > 0"
          class="text-success flex flex-wrap items-center gap-1"
        >
          <span class="badge badge-xs badge-success">includes:</span>
          <span
            v-for="(pat, i) in compiledRegex.includes"
            :key="i"
            class="bg-base-100 border-success/30 rounded border px-1.5 py-0.5"
          >
            "{{ pat }}"
          </span>
        </div>
        <div
          v-if="compiledRegex.excludes.length > 0"
          class="text-error flex flex-wrap items-center gap-1"
        >
          <span class="badge badge-xs badge-error">excludes:</span>
          <span
            v-for="(pat, i) in compiledRegex.excludes"
            :key="i"
            class="bg-base-100 border-error/30 rounded border px-1.5 py-0.5"
          >
            "{{ pat }}"
          </span>
        </div>
        <div
          v-if="compiledRegex.includes.length === 0 && compiledRegex.excludes.length === 0"
          class="text-base-content/50"
        >
          includes: [".*"] (全部放行)
        </div>
      </div>

      <!-- Sample Node Match Pills -->
      <div class="mt-2.5 flex flex-wrap gap-1.5">
        <span
          v-for="node in sampleNodes"
          :key="node.name"
          class="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[10px] transition-all"
          :class="
            isNodeMatched(node)
              ? 'border-success/40 bg-success/15 text-success font-medium'
              : 'border-base-300 bg-base-100/80 text-base-content/40 opacity-60'
          "
        >
          <CheckCircleIcon
            v-if="isNodeMatched(node)"
            class="h-3 w-3"
          />
          <XCircleIcon
            v-else
            class="h-3 w-3"
          />
          {{ node.name }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  isConditionNode,
  type ConditionField,
  type ConditionItem,
  type ConditionNode,
  type ConditionOp,
  type TestProviderNode,
} from '@/api/config/types'
import { compileConditionNode, evaluateConditionNode } from '@/store/configDraft'
import {
  CheckCircleIcon,
  FolderPlusIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline'
import { computed } from 'vue'

const model = defineModel<ConditionNode>({ required: true })

defineProps<{
  isNested?: boolean
}>()

// Built-in representative test nodes to show real-time matching feedback
const sampleNodes: TestProviderNode[] = [
  {
    name: '🇭🇰 HK 01 (BGP Premium)',
    type: 'shadowsocks',
    region: 'HK',
    server: 'hk1.cagedbird.cn',
    port: 443,
  },
  {
    name: '🇭🇰 HK 02 (CN2 GIA)',
    type: 'vmess',
    region: 'HK',
    server: 'hk2.cagedbird.cn',
    port: 443,
  },
  {
    name: '🇯🇵 JP 01 (Tokyo BGP)',
    type: 'vless',
    region: 'JP',
    server: 'jp1.cagedbird.cn',
    port: 8443,
  },
  {
    name: '🇯🇵 JP 02 (Osaka Direct)',
    type: 'shadowsocks',
    region: 'JP',
    server: 'jp2.cagedbird.cn',
    port: 443,
  },
  {
    name: '🇺🇸 US 01 (Los Angeles GIA)',
    type: 'hysteria2',
    region: 'US',
    server: 'us1.cagedbird.cn',
    port: 443,
  },
  {
    name: '🇸🇬 SG 01 (Singapore Fast)',
    type: 'trojan',
    region: 'SG',
    server: 'sg1.cagedbird.cn',
    port: 443,
  },
  {
    name: '🌐 官网与服务公告 (Direct)',
    type: 'direct',
    region: 'CN',
    server: 'cagedbird.cn',
    port: 80,
  },
]

const compiledRegex = computed(() => {
  return compileConditionNode(model.value)
})

const matchedSampleNodes = computed(() => {
  return sampleNodes.filter((node) => evaluateConditionNode(node, model.value))
})

const isNodeMatched = (node: TestProviderNode) => {
  return evaluateConditionNode(node, model.value)
}

const setLogic = (logic: 'and' | 'or' | 'not') => {
  model.value.logic = logic
}

const addCondition = () => {
  if (!model.value.conditions) {
    model.value.conditions = []
  }
  const newCond: ConditionItem = {
    id: `cond_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    field: 'name' as ConditionField,
    op: 'contains' as ConditionOp,
    value: '',
  }
  model.value.conditions.push(newCond)
}

const addGroup = () => {
  if (!model.value.conditions) {
    model.value.conditions = []
  }
  const newGroup: ConditionNode = {
    id: `group_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    logic: 'and',
    conditions: [
      {
        id: `cond_${Date.now()}_1`,
        field: 'name' as ConditionField,
        op: 'contains' as ConditionOp,
        value: '',
      },
    ],
  }
  model.value.conditions.push(newGroup)
}

const removeCondition = (index: number) => {
  model.value.conditions.splice(index, 1)
}

const getNestedGroup = (index: number): ConditionNode => {
  return model.value.conditions[index] as ConditionNode
}

const updateNestedGroup = (index: number, val: ConditionNode) => {
  model.value.conditions[index] = val
}
</script>
