import { create } from 'zustand'
import type { Item, AutoTagStatus, TaskMode, TriggerCheckStats } from '../api/client'

export type AutoTagState =
  | 'unavailable'
  | 'not_downloaded'
  | 'downloading'
  | 'loading'
  | 'ready'
  | 'unloaded'
  | 'error'

export interface DownloadProgressInfo {
  downloaded_bytes: number
  total_bytes: number
  current_file: string
  files_done: number
  files_total: number
}

export interface BatchTagProgress {
  current: number
  total: number
  filename: string
}

interface DatasetState {
  items: Item[]
  total: number
  selectedFilename: string | null
  selectedFilenames: string[]
  filterUntagged: boolean
  searchQuery: string
  panelOpen: boolean
  setItems: (items: Item[], total: number) => void
  setSelected: (filename: string | null) => void
  toggleSelection: (filename: string) => void
  clearSelection: () => void
  setFilterUntagged: (v: boolean) => void
  setSearchQuery: (q: string) => void
  setPanelOpen: (open: boolean) => void
  updateItem: (filename: string, caption: string) => void

  autoTagState: AutoTagState
  autoTagDevice: string | null
  autoTagModel: string | null
  autoTagTaskMode: string
  autoTagTemperature: number
  autoTagGpuAvailable: boolean
  autoTagDownloaded: boolean
  autoTagLastError: string | null
  autoTagModes: TaskMode[]
  downloadProgress: DownloadProgressInfo | null
  batchTagProgress: BatchTagProgress | null
  batchTagTotal: number | null
  gpuFallbackConfirmed: boolean
  setAutoTagStatus: (status: AutoTagStatus) => void
  setAutoTagModes: (modes: TaskMode[], current: string) => void
  setAutoTagTaskMode: (mode: string) => void
  setAutoTagTemperature: (temp: number) => void
  setDownloadProgress: (p: DownloadProgressInfo | null) => void
  setBatchTagProgress: (p: BatchTagProgress | null) => void
  setBatchTagTotal: (t: number | null) => void
  setGpuFallbackConfirmed: (v: boolean) => void

  triggerWords: string[]
  triggerCheckStats: TriggerCheckStats | null
  triggerPanelOpen: boolean
  triggerResults: Record<string, { status: string; variant: string | null }>
  triggerFilter: 'all' | 'has_trigger' | 'missing' | 'warning'
  setTriggerWords: (words: string[]) => void
  setTriggerCheckStats: (stats: TriggerCheckStats | null) => void
  setTriggerPanelOpen: (open: boolean) => void
  setTriggerResults: (results: Record<string, { status: string; variant: string | null }>) => void
  setTriggerFilter: (filter: 'all' | 'has_trigger' | 'missing' | 'warning') => void
}

export const useDatasetStore = create<DatasetState>((set) => ({
  items: [],
  total: 0,
  selectedFilename: null,
  selectedFilenames: [],
  filterUntagged: false,
  searchQuery: '',
  panelOpen: false,
  setItems: (items, total) => set({ items, total }),
  setSelected: (filename) => set({ selectedFilename: filename, selectedFilenames: [] }),
  toggleSelection: (filename) =>
    set((state) => {
      const exists = state.selectedFilenames.includes(filename)
      return {
        selectedFilenames: exists
          ? state.selectedFilenames.filter((f) => f !== filename)
          : [...state.selectedFilenames, filename],
      }
    }),
  clearSelection: () => set({ selectedFilenames: [], selectedFilename: null }),
  setFilterUntagged: (v) => set({ filterUntagged: v }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setPanelOpen: (open) => set({ panelOpen: open }),
  updateItem: (filename, caption) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.filename === filename ? { ...item, caption, tagged: caption.trim().length > 0 } : item
      ),
    })),

  autoTagState: 'unavailable',
  autoTagDevice: null,
  autoTagModel: null,
  autoTagTaskMode: 'generate_tags',
  autoTagTemperature: 1.0,
  autoTagGpuAvailable: false,
  autoTagDownloaded: false,
  autoTagLastError: null,
  autoTagModes: [],
  downloadProgress: null,
  batchTagProgress: null,
  batchTagTotal: null,
  gpuFallbackConfirmed: false,

  setAutoTagStatus: (status) => set({
    autoTagState: status.state as AutoTagState,
    autoTagDevice: status.device,
    autoTagModel: status.model,
    autoTagTemperature: status.temperature,
    autoTagGpuAvailable: status.gpu_available,
    autoTagDownloaded: status.downloaded,
    autoTagLastError: status.last_error,
  }),
  setAutoTagModes: (modes, current) => set((state) => ({
    autoTagModes: modes,
    autoTagTaskMode: state.autoTagModes.length === 0 ? current : state.autoTagTaskMode,
  })),
  setAutoTagTaskMode: (mode) => set({ autoTagTaskMode: mode }),
  setAutoTagTemperature: (temp) => set({ autoTagTemperature: temp }),
  setDownloadProgress: (p) => set({ downloadProgress: p }),
  setBatchTagProgress: (p) => set({ batchTagProgress: p }),
  setBatchTagTotal: (t) => set({ batchTagTotal: t }),
  setGpuFallbackConfirmed: (v) => set({ gpuFallbackConfirmed: v }),

  triggerWords: [],
  triggerCheckStats: null,
  triggerPanelOpen: false,
  triggerResults: {},
  triggerFilter: 'all',
  setTriggerWords: (words) => set({ triggerWords: words }),
  setTriggerCheckStats: (stats) => set({ triggerCheckStats: stats }),
  setTriggerPanelOpen: (open) => set({ triggerPanelOpen: open }),
  setTriggerResults: (results) => set({ triggerResults: results }),
  setTriggerFilter: (filter) => set({ triggerFilter: filter }),
}))
