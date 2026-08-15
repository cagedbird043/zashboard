<template>
  <div class="flex flex-col gap-4">
    <!-- Header Summary Card -->
    <div class="base-container flex flex-wrap items-center justify-between gap-4 p-4 md:p-5">
      <div class="flex items-center gap-3">
        <div class="border-warning/20 bg-warning/10 text-warning rounded-2xl border p-3">
          <ArrowsPointingInIcon class="h-6 w-6" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-base-content text-xl font-bold tracking-tight">
              入站协议与接口 (Inbound Listeners)
            </h2>
            <span class="badge badge-warning badge-sm font-mono">
              {{ inbounds.length }} 个入站接口
            </span>
          </div>
          <p class="text-base-content/60 mt-0.5 text-xs">
            配置 TUN 虚拟网卡 (Auto Route/Stack)、Mixed/Socks/HTTP 端口代理、TProxy
            透明代理及嗅探设置
          </p>
        </div>
      </div>

      <button
        type="button"
        class="btn btn-primary btn-sm"
        @click="openAddModal"
      >
        <PlusIcon class="h-4 w-4" />
        添加入站接口
      </button>
    </div>

    <!-- Inbounds Cards Grid -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div
        v-for="inb in inbounds"
        :key="inb.id"
        class="base-container border-base-300/80 hover:border-primary/40 flex flex-col gap-3 border p-4 transition-all"
      >
        <!-- Header -->
        <div class="border-base-300/60 flex items-center justify-between border-b pb-3">
          <div class="flex items-center gap-2">
            <span
              class="badge badge-sm font-mono font-bold uppercase"
              :class="getInboundBadgeClass(inb.type)"
            >
              {{ inb.type }}
            </span>
            <span class="text-base-content text-base font-semibold">{{ inb.tag }}</span>
          </div>

          <div class="flex items-center gap-1">
            <input
              v-model="inb.enabled"
              type="checkbox"
              class="toggle toggle-primary toggle-xs mr-2"
            />
            <button
              type="button"
              class="btn btn-ghost btn-xs text-primary"
              @click="editInbound(inb)"
            >
              <PencilSquareIcon class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-xs text-error hover:bg-error/10"
              @click="deleteInbound(inb.id)"
            >
              <TrashIcon class="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <!-- Details Grid -->
        <div class="grid grid-cols-2 gap-2 text-xs">
          <!-- Listen Address / Port -->
          <div v-if="inb.listen || inb.listen_port">
            <span class="text-base-content/50 block text-[11px]">监听地址 (Listen:Port):</span>
            <span class="text-base-content font-mono font-semibold">
              {{ inb.listen || '0.0.0.0' }}:{{ inb.listen_port || 7890 }}
            </span>
          </div>

          <!-- Platform Badges -->
          <div>
            <span class="text-base-content/50 block text-[11px]">支持平台 (Platforms):</span>
            <div class="mt-0.5 flex flex-wrap gap-1">
              <span
                v-for="plat in inb.platforms || ['macos', 'linux', 'android']"
                :key="plat"
                class="badge badge-neutral badge-xs font-mono"
              >
                {{ plat }}
              </span>
            </div>
          </div>

          <!-- TUN specific: Stack & MTU -->
          <div v-if="inb.type === 'tun'">
            <span class="text-base-content/50 block text-[11px]">协议栈 (Stack & MTU):</span>
            <span class="text-base-content font-mono">
              Stack: {{ inb.stack || 'system' }} | MTU: {{ inb.mtu || 9000 }}
            </span>
          </div>

          <!-- TUN specific: IP -->
          <div v-if="inb.type === 'tun' && inb.inet4_address">
            <span class="text-base-content/50 block text-[11px]">IPv4 子网地址:</span>
            <span class="text-base-content font-mono">
              {{ inb.inet4_address }}
            </span>
          </div>

          <!-- Sniffing -->
          <div>
            <span class="text-base-content/50 block text-[11px]">协议嗅探 (Sniff):</span>
            <span
              class="badge badge-xs font-mono"
              :class="inb.sniff ? 'badge-success' : 'badge-ghost'"
            >
              {{ inb.sniff ? '已开启 (Sniffing ON)' : '已关闭' }}
            </span>
          </div>

          <!-- Auto Route -->
          <div v-if="inb.type === 'tun'">
            <span class="text-base-content/50 block text-[11px]">系统路由劫持 (Auto Route):</span>
            <span
              class="badge badge-xs font-mono"
              :class="inb.auto_route ? 'badge-primary' : 'badge-ghost'"
            >
              {{ inb.auto_route ? 'Auto Route ON' : 'OFF' }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <div
      v-if="modalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
    >
      <div class="base-container border-base-300 w-full max-w-lg border p-6 shadow-2xl">
        <h3 class="mb-4 text-base font-bold">
          {{ isEditing ? '编辑入站接口' : '添加入站接口' }}
        </h3>
        <form
          class="flex flex-col gap-3"
          @submit.prevent="saveModal"
        >
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label text-base-content/70 text-xs font-semibold">接口 Tag *</label>
              <input
                v-model="form.tag"
                type="text"
                required
                class="input input-bordered input-sm w-full font-mono"
                placeholder="例: tun-in / mixed-in"
              />
            </div>
            <div>
              <label class="label text-base-content/70 text-xs font-semibold">协议类型 *</label>
              <select
                v-model="form.type"
                class="select select-bordered select-sm w-full font-mono"
              >
                <option value="tun">TUN (虚拟网卡)</option>
                <option value="mixed">Mixed (HTTP + SOCKS)</option>
                <option value="tproxy">TProxy (透明代理)</option>
                <option value="socks">SOCKS5</option>
                <option value="http">HTTP</option>
                <option value="direct">Direct</option>
                <option value="redirect">Redirect</option>
              </select>
            </div>
          </div>

          <!-- Port / Listen for Port-based Inbounds -->
          <div
            v-if="form.type !== 'tun'"
            class="grid grid-cols-2 gap-3"
          >
            <div>
              <label class="label text-base-content/70 text-xs font-semibold"
                >监听 IP (Listen)</label
              >
              <input
                v-model="form.listen"
                type="text"
                class="input input-bordered input-sm w-full font-mono"
                placeholder="127.0.0.1 / 0.0.0.0"
              />
            </div>
            <div>
              <label class="label text-base-content/70 text-xs font-semibold"
                >监听端口 (Port)</label
              >
              <input
                v-model.number="form.listen_port"
                type="number"
                class="input input-bordered input-sm w-full font-mono"
                placeholder="7890"
              />
            </div>
          </div>

          <!-- TUN Settings -->
          <div
            v-if="form.type === 'tun'"
            class="grid grid-cols-2 gap-3"
          >
            <div>
              <label class="label text-base-content/70 text-xs font-semibold">网络栈 (Stack)</label>
              <select
                v-model="form.stack"
                class="select select-bordered select-sm w-full font-mono"
              >
                <option value="system">System (系统原生)</option>
                <option value="gvisor">gVisor (用户态)</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>
            <div>
              <label class="label text-base-content/70 text-xs font-semibold">MTU</label>
              <input
                v-model.number="form.mtu"
                type="number"
                class="input input-bordered input-sm w-full font-mono"
                placeholder="9000 / 1500"
              />
            </div>
          </div>

          <div
            v-if="form.type === 'tun'"
            class="flex items-center gap-4 py-1"
          >
            <label class="flex cursor-pointer items-center gap-2 text-xs">
              <input
                v-model="form.auto_route"
                type="checkbox"
                class="toggle toggle-primary toggle-xs"
              />
              Auto Route (自动路由)
            </label>
            <label class="flex cursor-pointer items-center gap-2 text-xs">
              <input
                v-model="form.strict_route"
                type="checkbox"
                class="toggle toggle-secondary toggle-xs"
              />
              Strict Route (严格防泄漏)
            </label>
          </div>

          <div class="flex items-center gap-4 py-1">
            <label class="flex cursor-pointer items-center gap-2 text-xs">
              <input
                v-model="form.sniff"
                type="checkbox"
                class="toggle toggle-success toggle-xs"
              />
              开启域名与协议嗅探 (Sniff)
            </label>
          </div>

          <div class="mt-4 flex justify-end gap-2">
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              @click="modalOpen = false"
            >
              取消
            </button>
            <button
              type="submit"
              class="btn btn-primary btn-sm"
            >
              保存接口
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'ConfigInbounds' })

import type { Inbound } from '@/api/config/types'
import { showNotification } from '@/helper/notification'
import { draftState } from '@/store/configDraft'
import {
  ArrowsPointingInIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline'
import { computed, reactive, ref } from 'vue'

const inbounds = computed({
  get: () => draftState.inbounds || [],
  set: (val: Inbound[]) => {
    draftState.inbounds = val
  },
})

const modalOpen = ref(false)
const isEditing = ref(false)

const form = reactive<Inbound>({
  id: '',
  tag: '',
  type: 'tun',
  listen: '127.0.0.1',
  listen_port: 7890,
  stack: 'system',
  mtu: 9000,
  auto_route: true,
  strict_route: true,
  sniff: true,
  enabled: true,
})

const getInboundBadgeClass = (type: string) => {
  switch (type) {
    case 'tun':
      return 'badge-primary'
    case 'mixed':
      return 'badge-secondary'
    case 'tproxy':
      return 'badge-accent'
    default:
      return 'badge-neutral'
  }
}

const openAddModal = () => {
  isEditing.value = false
  form.id = `inb_${Date.now()}`
  form.tag = ''
  form.type = 'tun'
  form.listen = '127.0.0.1'
  form.listen_port = 7890
  form.stack = 'system'
  form.mtu = 9000
  form.auto_route = true
  form.strict_route = true
  form.sniff = true
  form.enabled = true
  modalOpen.value = true
}

const editInbound = (inb: Inbound) => {
  isEditing.value = true
  Object.assign(form, JSON.parse(JSON.stringify(inb)))
  modalOpen.value = true
}

const saveModal = () => {
  if (!form.tag) return
  const idx = draftState.inbounds.findIndex((i) => i.id === form.id)
  if (idx > -1) {
    draftState.inbounds[idx] = { ...form }
    showNotification({ content: `Updated inbound: ${form.tag}`, type: 'alert-success' })
  } else {
    draftState.inbounds.push({ ...form })
    showNotification({ content: `Added inbound: ${form.tag}`, type: 'alert-success' })
  }
  modalOpen.value = false
}

const deleteInbound = (id: string) => {
  const idx = draftState.inbounds.findIndex((i) => i.id === id)
  if (idx > -1) {
    draftState.inbounds.splice(idx, 1)
    showNotification({ content: 'Inbound deleted', type: 'alert-info' })
  }
}
</script>
