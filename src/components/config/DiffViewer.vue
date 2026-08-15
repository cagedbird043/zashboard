<template>
  <div class="diff-viewer flex flex-col gap-3 font-mono text-xs">
    <div class="border-base-300/80 flex items-center justify-between border-b pb-2">
      <div class="flex items-center gap-3">
        <span class="badge badge-error badge-xs font-semibold">- 变更前 (Old)</span>
        <span class="badge badge-success badge-xs font-semibold">+ 变更后 (New)</span>
      </div>
      <div class="text-base-content/50 text-[11px]">
        {{ diffLines.filter((l) => l.type === 'add').length }} 新增,
        {{ diffLines.filter((l) => l.type === 'del').length }} 移除
      </div>
    </div>

    <div
      class="border-base-300/80 bg-base-300/20 max-h-[500px] overflow-y-auto rounded-lg border p-2"
    >
      <div
        v-for="(line, idx) in diffLines"
        :key="idx"
        class="flex items-start gap-2 rounded px-1.5 py-0.5 leading-relaxed"
        :class="{
          'bg-success/15 text-success font-medium': line.type === 'add',
          'bg-error/15 text-error font-medium': line.type === 'del',
          'text-base-content/70': line.type === 'same',
        }"
      >
        <span class="text-base-content/30 w-6 shrink-0 text-right text-[10px] select-none">
          {{ line.lineNum || '' }}
        </span>
        <span class="w-3 shrink-0 font-bold select-none">
          {{ line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ' }}
        </span>
        <pre class="flex-1 font-mono text-[11px] break-all whitespace-pre-wrap">{{
          line.text
        }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  oldContent: string | Record<string, unknown>
  newContent: string | Record<string, unknown>
}>()

interface DiffLine {
  type: 'add' | 'del' | 'same'
  text: string
  lineNum?: number
}

const diffLines = computed<DiffLine[]>(() => {
  const oldStr =
    typeof props.oldContent === 'string'
      ? props.oldContent
      : JSON.stringify(props.oldContent, null, 2)
  const newStr =
    typeof props.newContent === 'string'
      ? props.newContent
      : JSON.stringify(props.newContent, null, 2)

  const oldLines = oldStr.split('\n')
  const newLines = newStr.split('\n')

  const result: DiffLine[] = []
  let oIdx = 0
  let nIdx = 0

  while (oIdx < oldLines.length || nIdx < newLines.length) {
    const oLine = oldLines[oIdx]
    const nLine = newLines[nIdx]

    if (oLine === nLine) {
      if (oLine !== undefined) {
        result.push({ type: 'same', text: oLine, lineNum: nIdx + 1 })
      }
      oIdx++
      nIdx++
    } else {
      if (oLine !== undefined && (nLine === undefined || !newLines.slice(nIdx).includes(oLine))) {
        result.push({ type: 'del', text: oLine, lineNum: oIdx + 1 })
        oIdx++
      } else if (nLine !== undefined) {
        result.push({ type: 'add', text: nLine, lineNum: nIdx + 1 })
        nIdx++
      } else {
        oIdx++
        nIdx++
      }
    }
  }

  return result
})
</script>
