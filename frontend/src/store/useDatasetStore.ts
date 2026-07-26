import { create } from 'zustand'
import type { Item } from '../api/client'

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
  clearSelection: () => set({ selectedFilenames: [] }),
  setFilterUntagged: (v) => set({ filterUntagged: v }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setPanelOpen: (open) => set({ panelOpen: open }),
  updateItem: (filename, caption) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.filename === filename ? { ...item, caption, tagged: caption.trim().length > 0 } : item
      ),
    })),
}))