import { fetchDaeCapabilitiesAPI } from '@/api/dae'
import { activeBackend } from '@/store/setup'
import type { DaeCapabilities } from '@/types'
import { ref } from 'vue'

export const daeCapabilities = ref<DaeCapabilities | null>(null)
export const singboxProviderCapabilities = ref({ refresh: false, healthCheck: false })

export const resetCapabilities = () => {
  daeCapabilities.value = null
  singboxProviderCapabilities.value = { refresh: false, healthCheck: false }
}

export const fetchCapabilities = async () => {
  if (activeBackend.value?.type !== 'dae') {
    resetCapabilities()
    return
  }

  try {
    daeCapabilities.value = await fetchDaeCapabilitiesAPI()
  } catch {
    daeCapabilities.value = null
  }
}
