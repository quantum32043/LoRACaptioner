import { create } from 'zustand'
import type { Item } from '../api/client'

interface DatasetState {
  items: Item[]
  total: number
  selectedFilename: string | null
  filterUntagged: boolean
  searchQuery: string
  setItems: (items: Item[], total: number) => void
  setSelected: (filename: string | null) => void
  setFilterUntagged: (v: boolean) => void
  setSearchQuery: (q: string) => void
  updateItem: (filename: string, caption: string) => void
}

export const useDatasetStore = create<DatasetState>((set) => ({
  items: [],
  total: 0,
  selectedFilename: null,
  filterUntagged: false,
  searchQuery: '',
  setItems: (items, total) => set({ items, total }),
  setSelected: (filename) => set({ selectedFilename: filename }),
  setFilterUntagged: (v) => set({ filterUntagged: v }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  updateItem: (filename, caption) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.filename === filename ? { ...item, caption, tagged: caption.trim().length > 0 } : item
      ),
    })),
}))