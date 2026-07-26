export interface Item {
  filename: string
  caption: string
  tagged: boolean
  thumb_url: string
  full_url: string
}

export interface ItemsResponse {
  items: Item[]
  total: number
}

export interface Stats {
  total: number
  tagged: number
  untagged: number
}

export interface BatchRequest {
  op: 'prepend' | 'append' | 'remove_tag' | 'regex_replace'
  value: string
  value2?: string
  filenames?: string[] | null
  only_untagged: boolean
}

export interface BatchResponse {
  changed: number
  total: number
}

const BASE = '/api'

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, init)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export const api = {
  getItems(offset = 0, limit = 20000, onlyUntagged = false, search?: string) {
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit), only_untagged: String(onlyUntagged) })
    if (search) params.set('search', search)
    return fetchJson<ItemsResponse>(`/dataset/items?${params}`)
  },

  getStats() {
    return fetchJson<Stats>('/dataset/stats')
  },

  saveCaption(filename: string, caption: string) {
    const params = new URLSearchParams({ filename, caption })
    return fetchJson<{ status: string }>(`/dataset/caption?${params}`, { method: 'PUT' })
  },

  uploadFolder(files: FileList): Promise<{ status: string; saved: number; total: number }> {
    const form = new FormData()
    Array.from(files).forEach((f) => form.append('files', f))
    return fetchJson('/dataset/upload-folder', { method: 'POST', body: form })
  },

  batch(body: BatchRequest) {
    return fetchJson<BatchResponse>('/dataset/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  },

  rescan() {
    return fetchJson<{ status: string; total: number }>('/dataset/rescan', { method: 'POST' })
  },
}