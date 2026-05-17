import type { TailscaleStatusResponse } from '@/types'

export const hasUsableTailnetStatus = (status?: Pick<TailscaleStatusResponse, 'endpoints'>) => {
  return Boolean(status?.endpoints?.length)
}
