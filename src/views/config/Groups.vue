<template>
  <div class="flex flex-col gap-4">
    <!-- Header Summary Card -->
    <div class="base-container flex flex-wrap items-center justify-between gap-4 p-4 md:p-5">
      <div class="flex items-center gap-3">
        <div class="border-secondary/20 bg-secondary/10 text-secondary rounded-2xl border p-3">
          <RectangleStackIcon class="h-6 w-6" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-base-content text-xl font-bold tracking-tight">
              出站分组管理 (Outbound Groups)
            </h2>
            <span class="badge badge-secondary badge-sm font-mono">
              {{ groups.length }} 个出站组
            </span>
          </div>
          <p class="text-base-content/60 mt-0.5 text-xs">
            配置 Selector 策略组、URLTest 自动测速优选、国家/地区聚合与 Home Assistant 动态条件过滤
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="btn btn-primary btn-sm"
          @click="openAddDrawer"
        >
          <PlusIcon class="h-4 w-4" />
          新建出站组
        </button>
      </div>
    </div>

    <!-- Quick Stats Cards -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="rounded-box border-base-300/70 bg-base-100 border p-3">
        <div class="text-base-content/50 text-xs">Selector 手动选择组</div>
        <div class="text-secondary mt-1 font-mono text-2xl font-bold">
          {{ selectorCount }}
        </div>
      </div>
      <div class="rounded-box border-base-300/70 bg-base-100 border p-3">
        <div class="text-base-content/50 text-xs">URLTest 自动优选组</div>
        <div class="text-primary mt-1 font-mono text-2xl font-bold">
          {{ urltestCount }}
        </div>
      </div>
      <div class="rounded-box border-base-300/70 bg-base-100 border p-3">
        <div class="text-base-content/50 text-xs">Fallback 故障转移组</div>
        <div class="text-warning mt-1 font-mono text-2xl font-bold">
          {{ fallbackCount }}
        </div>
      </div>
      <div class="rounded-box border-base-300/70 bg-base-100 border p-3">
        <div class="text-base-content/50 text-xs">LoadBalance 负载均衡组</div>
        <div class="text-success mt-1 font-mono text-2xl font-bold">
          {{ loadbalanceCount }}
        </div>
      </div>
    </div>

    <!-- Draggable Group Cards List -->
    <div class="flex flex-col gap-3">
      <Draggable
        v-model="groups"
        :animation="150"
        ghost-class="opacity-50"
        handle=".drag-handle"
        item-key="id"
      >
        <template #item="{ element: grp }">
          <div
            class="base-container group hover:border-primary/40 border-base-300/80 flex cursor-pointer flex-col gap-3 border p-4 transition-all hover:shadow-md"
            @click="openEditDrawer(grp)"
          >
            <!-- Card Header Row -->
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-3">
                <Bars3Icon
                  class="drag-handle text-base-content/40 hover:text-base-content h-5 w-5 shrink-0 cursor-move"
                  @click.stop
                />
                <div class="flex items-center gap-2">
                  <h3 class="text-base-content text-base font-semibold">
                    {{ grp.name }}
                  </h3>
                  <span
                    class="badge badge-sm font-mono font-bold uppercase"
                    :class="getGroupBadgeClass(grp.type)"
                  >
                    {{ grp.type }}
                  </span>
                </div>
              </div>

              <!-- Right Actions -->
              <div
                class="flex items-center gap-1"
                @click.stop
              >
                <button
                  type="button"
                  class="btn btn-ghost btn-xs text-primary"
                  @click="openEditDrawer(grp)"
                >
                  <PencilSquareIcon class="h-3.5 w-3.5" />
                  编辑
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-xs text-base-content/60"
                  @click="duplicateGroup(grp)"
                >
                  <DocumentDuplicateIcon class="h-3.5 w-3.5" />
                  复制
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-xs text-error hover:bg-error/10"
                  @click="deleteGroup(grp.id)"
                >
                  <TrashIcon class="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <!-- Description -->
            <p
              v-if="grp.description"
              class="text-base-content/70 text-xs"
            >
              {{ grp.description }}
            </p>

            <!-- Metadata Pills & Condition Summary -->
            <div class="border-base-200/60 flex flex-wrap items-center gap-2 border-t pt-1 text-xs">
              <!-- Providers Badges -->
              <div
                v-if="grp.providers && grp.providers.length > 0"
                class="flex items-center gap-1"
              >
                <span class="text-base-content/50 text-[11px]">订阅源:</span>
                <span
                  v-for="provId in grp.providers"
                  :key="provId"
                  class="badge badge-neutral badge-xs font-mono"
                >
                  {{ getProviderName(provId) }}
                </span>
              </div>

              <!-- Static Outbounds Badges -->
              <div
                v-if="grp.outbounds && grp.outbounds.length > 0"
                class="flex items-center gap-1"
              >
                <span class="text-base-content/50 text-[11px]">出站项:</span>
                <span
                  v-for="out in grp.outbounds"
                  :key="out"
                  class="badge badge-outline badge-xs"
                >
                  {{ out }}
                </span>
              </div>

              <!-- Filter Conditions Summary Badge -->
              <div
                v-if="grp.filter && grp.filter.conditions && grp.filter.conditions.length > 0"
                class="flex items-center gap-1"
              >
                <span class="badge badge-primary badge-outline badge-xs font-mono">
                  🔍 {{ grp.filter.conditions.length }} 条过滤规则 ({{
                    grp.filter.logic.toUpperCase()
                  }})
                </span>
                <span
                  v-if="grp.includes && grp.includes.length > 0"
                  class="text-success font-mono text-[10px]"
                >
                  include: "{{ grp.includes.join(', ') }}"
                </span>
              </div>

              <!-- URLTest Details -->
              <div
                v-if="grp.type === 'urltest' || grp.type === 'fallback'"
                class="text-base-content/60 flex items-center gap-2 font-mono text-[11px]"
              >
                <span>间隔: {{ grp.interval || '5m' }}</span>
                <span>容差: {{ grp.tolerance ?? 50 }}ms</span>
              </div>
            </div>
          </div>
        </template>
      </Draggable>

      <div
        v-if="groups.length === 0"
        class="base-container text-base-content/40 py-12 text-center text-xs"
      >
        暂无配置出站组，点击上方 "新建出站组" 按钮创建
      </div>
    </div>

    <!-- Group Drawer Modal -->
    <GroupDrawer
      v-model="drawerOpen"
      :group="selectedGroup"
      @save="handleSaveGroup"
    />
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'ConfigGroups' })

import type { Group } from '@/api/config/types'
import GroupDrawer from '@/components/config/GroupDrawer.vue'
import { showNotification } from '@/helper/notification'
import { draftState } from '@/store/configDraft'
import {
  Bars3Icon,
  DocumentDuplicateIcon,
  PencilSquareIcon,
  PlusIcon,
  RectangleStackIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline'
import { computed, ref } from 'vue'
import Draggable from 'vuedraggable'
const drawerOpen = ref(false)
const selectedGroup = ref<Group | null>(null)

const groups = computed({
  get: () => draftState.groups || [],
  set: (val: Group[]) => {
    draftState.groups = val
  },
})

const selectorCount = computed(() => groups.value.filter((g) => g.type === 'selector').length)
const urltestCount = computed(() => groups.value.filter((g) => g.type === 'urltest').length)
const fallbackCount = computed(() => groups.value.filter((g) => g.type === 'fallback').length)
const loadbalanceCount = computed(() => groups.value.filter((g) => g.type === 'loadbalance').length)

const getGroupBadgeClass = (type: string) => {
  switch (type) {
    case 'selector':
      return 'badge-secondary'
    case 'urltest':
      return 'badge-primary'
    case 'fallback':
      return 'badge-warning'
    case 'loadbalance':
      return 'badge-success'
    default:
      return 'badge-ghost'
  }
}

const getProviderName = (id: string) => {
  const p = (draftState.providers || []).find((prov) => prov.id === id)
  return p ? p.name : id
}

const openAddDrawer = () => {
  selectedGroup.value = null
  drawerOpen.value = true
}

const openEditDrawer = (grp: Group) => {
  selectedGroup.value = grp
  drawerOpen.value = true
}

const duplicateGroup = (grp: Group) => {
  const clone: Group = JSON.parse(JSON.stringify(grp))
  clone.id = `group_${Date.now()}`
  clone.name = `${grp.name} (Copy)`
  draftState.groups.push(clone)
  showNotification({
    content: `Duplicated group: ${clone.name}`,
    type: 'alert-success',
  })
}

const handleSaveGroup = (saved: Group) => {
  const idx = draftState.groups.findIndex((g) => g.id === saved.id)
  if (idx > -1) {
    draftState.groups[idx] = saved
    showNotification({
      content: `Updated group: ${saved.name}`,
      type: 'alert-success',
    })
  } else {
    draftState.groups.push(saved)
    showNotification({
      content: `Created group: ${saved.name}`,
      type: 'alert-success',
    })
  }
}

const deleteGroup = (id: string) => {
  const idx = draftState.groups.findIndex((g) => g.id === id)
  if (idx > -1) {
    const name = draftState.groups[idx].name
    draftState.groups.splice(idx, 1)
    showNotification({
      content: `Deleted group: ${name}`,
      type: 'alert-info',
    })
  }
}
</script>
