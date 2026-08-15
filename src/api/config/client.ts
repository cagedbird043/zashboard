import axios, { type AxiosInstance, type AxiosResponse } from 'axios'
import type {
  ControlPlaneStatus,
  DraftMeta,
  DraftState,
  ReleaseRecord,
  TestProviderResult,
} from './types'

export const configApiClient: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 30000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
})

// Provide an easy way to configure custom API endpoint if needed
export const setConfigApiBaseURL = (baseURL: string) => {
  configApiClient.defaults.baseURL = baseURL
}

export const fetchStatusAPI = async (): Promise<ControlPlaneStatus> => {
  const res: AxiosResponse<{ status: string; data?: ControlPlaneStatus } & ControlPlaneStatus> =
    await configApiClient.get('/status')
  return res.data?.data || res.data
}

export const fetchDraftAPI = async (): Promise<{ draft: DraftState; meta: DraftMeta }> => {
  const res: AxiosResponse<{ status: string; draft: DraftState; meta: DraftMeta }> =
    await configApiClient.get('/draft')
  return {
    draft: res.data.draft,
    meta: res.data.meta,
  }
}

export const saveDraftAPI = async (
  draft: DraftState,
  message?: string,
): Promise<{ status: string; message: string; meta?: { commit: string } }> => {
  const res = await configApiClient.post('/draft', {
    draft,
    message,
  })
  return res.data
}

export const testProviderAPI = async (url: string): Promise<TestProviderResult> => {
  const res: AxiosResponse<TestProviderResult> = await configApiClient.post('/providers/test', {
    url,
  })
  return res.data
}

export const triggerReleaseAPI = async (
  message?: string,
): Promise<{ status: string; revision: string; artifacts?: unknown; message?: string }> => {
  const res = await configApiClient.post('/release', {
    message,
  })
  return res.data
}

export const rollbackReleaseAPI = async (
  revision: string,
): Promise<{ status: string; revision: string; message: string }> => {
  const res = await configApiClient.post('/rollback', {
    revision,
  })
  return res.data
}

export const fetchReleasesAPI = async (): Promise<{
  status: string
  releases: ReleaseRecord[]
}> => {
  const res = await configApiClient.get('/releases')
  return res.data
}
