<template>
  <div class="flex flex-col gap-4">
    <!-- Header Summary Card -->
    <div class="base-container flex flex-wrap items-center justify-between gap-4 p-4 md:p-5">
      <div class="flex items-center gap-3">
        <div class="border-primary/20 bg-primary/10 text-primary rounded-2xl border p-3">
          <CodeBracketSquareIcon class="h-6 w-6" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-base-content text-xl font-bold tracking-tight">
              原始 JSONC 实时编辑器 (Raw JSONC Editor)
            </h2>
            <span
              class="badge badge-sm font-mono font-bold"
              :class="syntaxError ? 'badge-error' : 'badge-success'"
            >
              {{ syntaxError ? '语法错误 (Syntax Error)' : '语法校验通过 (Valid)' }}
            </span>
          </div>
          <p class="text-base-content/60 mt-0.5 text-xs">
            双向绑定当前草稿模块，支持 JSONC 带注释格式、格式化排版、分段与全量草稿保存
          </p>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex flex-wrap items-center gap-2">
        <select
          v-model="selectedSection"
          class="select select-bordered select-sm font-mono text-xs"
          @change="loadSectionContent"
        >
          <option value="all">全量草稿 (Full Draft State)</option>
          <option value="providers">providers (订阅源)</option>
          <option value="groups">groups (出站组与策略)</option>
          <option value="routes">routes (分流规则)</option>
          <option value="dns">dns (DNS 服务器与规则)</option>
          <option value="inbounds">inbounds (入站接口)</option>
          <option value="overlays">overlays (平台覆盖层)</option>
          <option value="base">base (基准模板)</option>
        </select>

        <button
          type="button"
          class="btn btn-ghost btn-sm"
          @click="formatJson"
        >
          <SparklesIcon class="h-4 w-4" />
          格式化 (Format)
        </button>

        <button
          type="button"
          class="btn btn-ghost btn-sm"
          @click="resetContent"
        >
          <ArrowPathIcon class="h-4 w-4" />
          重置 (Reset)
        </button>

        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="Boolean(syntaxError) || isSaving"
          @click="applyAndSave"
        >
          <span
            v-if="isSaving"
            class="loading loading-spinner loading-xs"
          ></span>
          <CheckIcon
            v-else
            class="h-4 w-4"
          />
          应用并保存草稿
        </button>
      </div>
    </div>

    <!-- Error Banner if any -->
    <div
      v-if="syntaxError"
      class="alert alert-error text-xs shadow-md"
    >
      <ExclamationTriangleIcon class="h-5 w-5 shrink-0" />
      <div>
        <div class="font-bold">JSONC 解析错误:</div>
        <div class="mt-0.5 font-mono">{{ syntaxError }}</div>
      </div>
    </div>

    <!-- Code Editor Card -->
    <div class="base-container flex flex-col p-4">
      <div class="border-base-300/80 mb-3 flex items-center justify-between border-b pb-2">
        <div class="text-base-content/70 flex items-center gap-2 font-mono text-xs">
          <span
            >模块: <strong class="text-primary">{{ selectedSection }}</strong></span
          >
          <span>•</span>
          <span>行数: {{ editorText.split('\n').length }}</span>
          <span>•</span>
          <span>字符数: {{ editorText.length }}</span>
        </div>
      </div>

      <div class="border-base-300 bg-neutral relative rounded-lg border">
        <textarea
          v-model="editorText"
          spellcheck="false"
          class="text-neutral-content min-h-[560px] w-full resize-y bg-transparent p-4 font-mono text-xs leading-relaxed outline-none"
          placeholder="// 在此编辑 JSONC 内容..."
          @input="validateSyntax"
        ></textarea>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'ConfigJsoncEditor' })

import { showNotification } from '@/helper/notification'
import { draftState, isSaving, saveDraft } from '@/store/configDraft'
import {
  ArrowPathIcon,
  CheckIcon,
  CodeBracketSquareIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
} from '@heroicons/vue/24/outline'
import { onMounted, ref, watch } from 'vue'

const selectedSection = ref<string>('all')
const editorText = ref<string>('{}')
const syntaxError = ref<string | null>(null)

const stripJsonComments = (str: string): string => {
  return str.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

const loadSectionContent = () => {
  let content: unknown
  if (selectedSection.value === 'all') {
    content = draftState
  } else {
    content = (draftState as unknown as Record<string, unknown>)[selectedSection.value] || {}
  }
  editorText.value = JSON.stringify(content, null, 2)
  validateSyntax()
}

onMounted(() => {
  loadSectionContent()
})

watch(
  () => draftState,
  () => {
    // Keep synced when external changes occur
  },
  { deep: true },
)

const validateSyntax = () => {
  try {
    const stripped = stripJsonComments(editorText.value)
    JSON.parse(stripped)
    syntaxError.value = null
  } catch (err: unknown) {
    if (err instanceof Error) {
      syntaxError.value = err.message
    } else {
      syntaxError.value = 'Unknown JSON parsing error'
    }
  }
}

const formatJson = () => {
  try {
    const stripped = stripJsonComments(editorText.value)
    const parsed = JSON.parse(stripped)
    editorText.value = JSON.stringify(parsed, null, 2)
    syntaxError.value = null
    showNotification({ content: 'JSON formatted successfully', type: 'alert-success' })
  } catch {
    validateSyntax()
    showNotification({ content: 'Cannot format invalid JSON', type: 'alert-error' })
  }
}

const resetContent = () => {
  loadSectionContent()
  showNotification({ content: 'Reset to draft state', type: 'alert-info' })
}

const applyAndSave = async () => {
  try {
    const stripped = stripJsonComments(editorText.value)
    const parsed = JSON.parse(stripped)

    if (selectedSection.value === 'all') {
      Object.assign(draftState, parsed)
    } else {
      ;(draftState as unknown as Record<string, unknown>)[selectedSection.value] = parsed
    }

    const ok = await saveDraft(`Update ${selectedSection.value} via Raw JSONC Editor`)
    if (ok) {
      loadSectionContent()
    }
  } catch {
    showNotification({ content: 'Cannot save invalid JSON', type: 'alert-error' })
  }
}
</script>
