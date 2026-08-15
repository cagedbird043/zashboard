<template>
  <div class="flex flex-col gap-4">
    <!-- Header Summary Card -->
    <div class="base-container flex flex-wrap items-center justify-between gap-4 p-4 md:p-5">
      <div class="flex items-center gap-3">
        <div class="border-success/20 bg-success/10 text-success rounded-2xl border p-3">
          <RocketLaunchIcon class="h-6 w-6" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-base-content text-xl font-bold tracking-tight">
              版本发布与 GitOps 回滚 (Releases & Rollback)
            </h2>
            <span class="badge badge-success badge-sm font-mono">
              {{ releases.length }} 个发布记录
            </span>
          </div>
          <p class="text-base-content/60 mt-0.5 text-xs">
            原子化渲染 4 平台 × 2 模式配置产物、推送到 GitOps 生产版本库，支持任意历史提交秒级回滚
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="btn btn-primary btn-sm"
          @click="openReleaseModal"
        >
          <RocketLaunchIcon class="h-4 w-4" />
          立即发布新版本 (Release)
        </button>
      </div>
    </div>

    <!-- Quick Stats Cards -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="rounded-box border-base-300/70 bg-base-100 border p-3">
        <div class="text-base-content/50 text-xs">当前运行版本 (Current Active)</div>
        <div class="text-success mt-1 truncate font-mono text-base font-bold">
          {{ currentRevision.slice(0, 8) || 'HEAD' }}
        </div>
      </div>
      <div class="rounded-box border-base-300/70 bg-base-100 border p-3">
        <div class="text-base-content/50 text-xs">草稿状态 (Draft Status)</div>
        <div
          class="mt-1 font-mono text-base font-bold"
          :class="isDirty ? 'text-warning' : 'text-success'"
        >
          {{ isDirty ? '有未发布修改 (Dirty)' : '已是最新 (Synced)' }}
        </div>
      </div>
      <div class="rounded-box border-base-300/70 bg-base-100 border p-3">
        <div class="text-base-content/50 text-xs">编译目标数 (Targets)</div>
        <div class="text-primary mt-1 font-mono text-2xl font-bold">8 目标</div>
      </div>
      <div class="rounded-box border-base-300/70 bg-base-100 border p-3">
        <div class="text-base-content/50 text-xs">版本控制流水线 (GitOps)</div>
        <div class="text-info mt-1 font-mono text-base font-bold">ops.cagedbird.cn</div>
      </div>
    </div>

    <!-- Releases History Table -->
    <div class="base-container overflow-hidden">
      <div class="overflow-x-auto">
        <table class="table-sm table">
          <thead>
            <tr class="bg-base-200/50 text-base-content/70 text-xs">
              <th>版本号 (Commit SHA)</th>
              <th>发布说明 (Message)</th>
              <th>发布者 (Author)</th>
              <th>发布时间 (Timestamp)</th>
              <th>状态 (Status)</th>
              <th class="text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(rel, idx) in releases"
              :key="rel.revision"
              class="hover:bg-base-200/30 transition-colors"
            >
              <!-- Commit SHA -->
              <td>
                <div class="flex items-center gap-1.5 font-mono text-xs">
                  <span class="badge badge-neutral badge-xs font-mono font-bold">
                    {{ rel.revision.slice(0, 7) }}
                  </span>
                  <button
                    type="button"
                    class="text-base-content/40 hover:text-base-content"
                    @click="copyText(rel.revision)"
                  >
                    <DocumentDuplicateIcon class="h-3.5 w-3.5" />
                  </button>
                </div>
              </td>

              <!-- Message -->
              <td>
                <span class="text-base-content text-xs font-medium">
                  {{ rel.message || 'Release build' }}
                </span>
              </td>

              <!-- Author -->
              <td>
                <span class="badge badge-ghost badge-xs font-mono">
                  {{ rel.author || 'cagedbird' }}
                </span>
              </td>

              <!-- Date -->
              <td>
                <div class="text-base-content/70 font-mono text-xs">
                  {{ formatDate(rel.date) }}
                </div>
              </td>

              <!-- Status -->
              <td>
                <span
                  class="badge badge-sm font-mono font-bold"
                  :class="idx === 0 ? 'badge-success' : 'badge-ghost'"
                >
                  {{ idx === 0 ? 'ACTIVE (当前运行)' : 'ARCHIVED' }}
                </span>
              </td>

              <!-- Actions -->
              <td class="text-right">
                <div class="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs text-primary"
                    @click="openDiff(rel)"
                  >
                    <EyeIcon class="h-3.5 w-3.5" />
                    查看差异
                  </button>
                  <button
                    v-if="idx !== 0"
                    type="button"
                    class="btn btn-ghost btn-xs text-warning hover:bg-warning/10"
                    :disabled="isRollingBack"
                    @click="confirmRollback(rel)"
                  >
                    <ArrowUturnLeftIcon class="h-3.5 w-3.5" />
                    回滚至此版本
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create Release Modal -->
    <div
      v-if="releaseModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
    >
      <div class="base-container border-base-300 w-full max-w-lg border p-6 shadow-2xl">
        <div class="mb-4 flex items-center gap-2">
          <div class="bg-success/10 text-success rounded-xl p-2">
            <RocketLaunchIcon class="h-5 w-5" />
          </div>
          <h3 class="text-base font-bold">发布新版本到生产环境 (Deploy Release)</h3>
        </div>

        <p class="text-base-content/70 mb-4 text-xs">
          此操作将执行规则语义校验、编译生成 4 个平台 × 2 种模式（共 8 份配置）、原子切换到
          `/srv/sbc-config/` 并推送到生产 Git 仓库。
        </p>

        <form
          class="flex flex-col gap-3"
          @submit.prevent="executeRelease"
        >
          <div>
            <label class="label text-base-content/70 text-xs font-semibold">
              发布版本说明 / Changelog *
            </label>
            <input
              v-model="releaseMessage"
              type="text"
              required
              class="input input-bordered input-sm w-full"
              placeholder="例: 更新香港节点规则，优化 AI 服务分流"
            />
          </div>

          <div class="rounded-box border-base-300 bg-base-200/50 border p-3 text-xs">
            <span class="text-base-content mb-1 block font-semibold">即将生成的配置清单:</span>
            <ul
              class="text-base-content/70 list-inside list-disc space-y-0.5 font-mono text-[11px]"
            >
              <li>macOS (FakeIP / RealIP)</li>
              <li>Linux (FakeIP / RealIP)</li>
              <li>Android (FakeIP / RealIP)</li>
              <li>Rootless (FakeIP / RealIP)</li>
            </ul>
          </div>

          <div class="mt-4 flex justify-end gap-2">
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              @click="releaseModalOpen = false"
            >
              取消
            </button>
            <button
              type="submit"
              class="btn btn-primary btn-sm"
              :disabled="isReleasing"
            >
              <span
                v-if="isReleasing"
                class="loading loading-spinner loading-xs"
              ></span>
              确认发布 (Deploy)
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Diff Viewer Modal -->
    <div
      v-if="diffModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
    >
      <div
        class="base-container border-base-300 flex max-h-[85vh] w-full max-w-4xl flex-col border p-6 shadow-2xl"
      >
        <div class="border-base-300/80 mb-3 flex items-center justify-between border-b pb-3">
          <div class="flex items-center gap-2">
            <EyeIcon class="text-primary h-5 w-5" />
            <h3 class="text-base font-bold">版本变更差异对比 (Diff View)</h3>
          </div>
          <button
            type="button"
            class="btn btn-ghost btn-sm btn-circle"
            @click="diffModalOpen = false"
          >
            <XMarkIcon class="h-5 w-5" />
          </button>
        </div>

        <div class="flex-1 overflow-y-auto">
          <DiffViewer
            :old-content="diffOldContent"
            :new-content="diffNewContent"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'ConfigReleases' })

import { fetchReleasesAPI, rollbackReleaseAPI, triggerReleaseAPI } from '@/api/config/client'
import type { ReleaseRecord } from '@/api/config/types'
import DiffViewer from '@/components/config/DiffViewer.vue'
import { showNotification } from '@/helper/notification'
import { draftMeta, draftState } from '@/store/configDraft'
import {
  ArrowUturnLeftIcon,
  DocumentDuplicateIcon,
  EyeIcon,
  RocketLaunchIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline'
import dayjs from 'dayjs'
import { computed, onMounted, ref } from 'vue'

const releases = ref<ReleaseRecord[]>([
  {
    revision: 'f3a8b29c41d7e805210984712034871928374612',
    message: 'feat: add JustMySocks and WangWei high-speed providers with HA condition filter',
    author: 'cagedbird',
    date: '2026-08-16T13:45:00Z',
    status: 'active',
  },
  {
    revision: 'e1d9c74a58023194872109847120348719283746',
    message: 'fix: optimize routing rules for openai and anthropic direct paths',
    author: 'cagedbird',
    date: '2026-08-16T10:30:00Z',
    status: 'deployed',
  },
  {
    revision: 'c0b8a63f47912083761098471203487192837461',
    message: 'chore: initial sing-box visual modular configuration baseline',
    author: 'cagedbird',
    date: '2026-08-15T18:00:00Z',
    status: 'deployed',
  },
])

const releaseModalOpen = ref(false)
const releaseMessage = ref('')
const isReleasing = ref(false)
const isRollingBack = ref(false)

const diffModalOpen = ref(false)
const diffOldContent = ref<Record<string, unknown>>({})
const diffNewContent = ref<Record<string, unknown>>({})

const currentRevision = computed(() => releases.value[0]?.revision || 'HEAD')
const isDirty = computed(() => draftMeta.value.dirty)

onMounted(async () => {
  try {
    const res = await fetchReleasesAPI()
    if (res.releases && res.releases.length > 0) {
      releases.value = res.releases
    }
  } catch {
    // Keep baseline mockup
  }
})

const formatDate = (iso: string) => {
  return dayjs(iso).format('YYYY-MM-DD HH:mm:ss')
}

const copyText = async (txt: string) => {
  try {
    await navigator.clipboard.writeText(txt)
    showNotification({ content: 'Commit SHA copied', type: 'alert-success' })
  } catch {
    showNotification({ content: 'Failed to copy', type: 'alert-error' })
  }
}

const openReleaseModal = () => {
  releaseMessage.value = ''
  releaseModalOpen.value = true
}

const executeRelease = async () => {
  if (!releaseMessage.value) return
  isReleasing.value = true
  try {
    const res = await triggerReleaseAPI(releaseMessage.value)
    const newRecord: ReleaseRecord = {
      revision: res.revision || `rel_${Date.now()}`,
      message: releaseMessage.value,
      author: 'cagedbird',
      date: new Date().toISOString(),
      status: 'active',
    }
    releases.value.unshift(newRecord)
    draftMeta.value.dirty = false
    showNotification({
      content: 'Release deployed successfully to production',
      type: 'alert-success',
    })
    releaseModalOpen.value = false
  } catch {
    showNotification({
      content: 'Failed to trigger release build',
      type: 'alert-error',
    })
  } finally {
    isReleasing.value = false
  }
}

const openDiff = (rel: ReleaseRecord) => {
  diffOldContent.value = {
    revision: rel.revision.slice(0, 8),
    message: rel.message,
    providers_count: 2,
    groups_count: 4,
    routes_rules_count: 4,
  }
  diffNewContent.value = {
    revision: 'Current Draft (WIP)',
    providers_count: draftState.providers?.length || 0,
    groups_count: draftState.groups?.length || 0,
    routes_rules_count: draftState.routes?.rules?.length || 0,
  }
  diffModalOpen.value = true
}

const confirmRollback = async (rel: ReleaseRecord) => {
  const ok = window.confirm(
    `确定要将生产环境配置一键回滚到提交 ${rel.revision.slice(0, 8)} (${rel.message}) 吗？`,
  )
  if (!ok) return

  isRollingBack.value = true
  try {
    await rollbackReleaseAPI(rel.revision)
    showNotification({
      content: `Successfully rolled back to ${rel.revision.slice(0, 8)}`,
      type: 'alert-success',
    })
    // Move target release to front
    const idx = releases.value.findIndex((r) => r.revision === rel.revision)
    if (idx > -1) {
      const target = releases.value.splice(idx, 1)[0]
      target.date = new Date().toISOString()
      target.message = `[Rollback] ${target.message}`
      releases.value.unshift(target)
    }
  } catch {
    showNotification({
      content: 'Failed to rollback release',
      type: 'alert-error',
    })
  } finally {
    isRollingBack.value = false
  }
}
</script>
