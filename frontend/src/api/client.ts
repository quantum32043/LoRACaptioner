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

export interface AutoTagStatus {
  state: string
  device: string | null
  model: string | null
  task_mode: string
  gpu_available: boolean
  downloaded: boolean
  last_error: string | null
}

export interface TaskMode {
  id: string
  label: string
  prompt: string
}

export interface AutoTagModesResponse {
  modes: TaskMode[]
  current: string
}

export interface DownloadProgress {
  downloaded_bytes: number
  total_bytes: number
  current_file: string
  files_done: number
  files_total: number
}

export interface AutoTagResult {
  filename: string
  caption: string
}

export interface AutoTagBatchDone {
  count: number
  total: number
}

export interface SSEMessage {
  event: string
  data: string
}

const BASE = '/api'

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, init)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function* fetchSSE(url: string, init?: RequestInit): AsyncGenerator<SSEMessage> {
  const res = await fetch(`${BASE}${url}`, init)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''
  let event = 'message'

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        event = line.slice(7).trim()
      } else if (line.startsWith('data: ')) {
        yield { event, data: line.slice(6).trim() }
        event = 'message'
      }
    }
  }
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

  getAutoTagStatus() {
    return fetchJson<AutoTagStatus>('/auto-tag/status')
  },

  getAutoTagModes() {
    return fetchJson<AutoTagModesResponse>('/auto-tag/modes')
  },

  setAutoTagMode(mode: string) {
    return fetchJson<{ status: string; mode: string }>('/auto-tag/set-mode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) })
  },

  unloadModel() {
    return fetchJson<{ status: string; state: string }>('/auto-tag/unload', { method: 'POST' })
  },

  generateCaption(filename: string, task?: string) {
    return fetchJson<AutoTagResult>('/auto-tag/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename, task }) })
  },

  downloadModelSSE(): AsyncGenerator<SSEMessage> {
    return fetchSSE('/auto-tag/download')
  },

  generateBatchSSE(filenames: string[], task?: string): AsyncGenerator<SSEMessage> {
    return fetchSSE('/auto-tag/generate-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filenames, task }),
    })
  },

  generateUntaggedSSE(task?: string): AsyncGenerator<SSEMessage> {
    return fetchSSE('/auto-tag/generate-untagged', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task }),
    })
  },
}
