import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { FolderUp, Search } from 'lucide-react'
import { useDatasetStore } from '../store/useDatasetStore'
import ImageCard from './ImageCard'

export default function ImageGrid() {
  const items = useDatasetStore((s) => s.items)
  const setSelected = useDatasetStore((s) => s.setSelected)
  const selectedFilename = useDatasetStore((s) => s.selectedFilename)
  const selectedFilenames = useDatasetStore((s) => s.selectedFilenames)
  const toggleSelection = useDatasetStore((s) => s.toggleSelection)
  const datasetFilter = useDatasetStore((s) => s.datasetFilter)
  const triggerResults = useDatasetStore((s) => s.triggerResults)
  const triggerWords = useDatasetStore((s) => s.triggerWords)
  const parentRef = useRef<HTMLDivElement>(null)
  const dragHappenedRef = useRef(false)

  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const dragEndRef = useRef<{ x: number; y: number } | null>(null)
  const isDraggingRef = useRef(false)
  const [selectionRect, setSelectionRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)

  const filteredItems = useMemo(() => {
    if (datasetFilter === 'all') return items
    if (datasetFilter === 'untagged') return items.filter((i) => !i.tagged)
    if (triggerWords.length === 0) {
      if (datasetFilter === 'has_trigger' || datasetFilter === 'trigger_warning') return []
      return items
    }
    return items.filter((item) => {
      const r = triggerResults[item.filename]
      if (datasetFilter === 'has_trigger') return r?.status === 'exact'
      if (datasetFilter === 'no_trigger') return !r || r.status === 'missing'
      if (datasetFilter === 'trigger_warning') return r && (r.status === 'case' || r.status === 'separator')
      return true
    })
  }, [items, datasetFilter, triggerResults, triggerWords])

  const cols = Math.max(1, Math.floor((parentRef.current?.clientWidth ?? 800) / 220))
  const rows = Math.ceil(filteredItems.length / cols)
  const padding = 16
  const gap = 12
  const rowHeight = 260

  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 3,
  })

  const getCardRect = useCallback((index: number) => {
    const el = parentRef.current
    if (!el) return null
    const row = Math.floor(index / cols)
    const col = index % cols
    const containerRect = el.getBoundingClientRect()
    const containerWidth = el.clientWidth - padding * 2
    const colWidth = Math.floor((containerWidth - (cols - 1) * gap) / cols)
    return {
      left: containerRect.left + padding + col * (colWidth + gap),
      top: containerRect.top + padding + row * rowHeight - el.scrollTop,
      right: containerRect.left + padding + col * (colWidth + gap) + colWidth,
      bottom: containerRect.top + padding + row * rowHeight - el.scrollTop + rowHeight,
    }
  }, [cols])

  useEffect(() => {
    const container = parentRef.current
    if (!container) return

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      const startX = e.clientX
      const startY = e.clientY
      dragStartRef.current = { x: startX, y: startY }
      dragEndRef.current = { x: startX, y: startY }
      isDraggingRef.current = true

      const onMove = (ev: PointerEvent) => {
        if (!isDraggingRef.current) return
        dragEndRef.current = { x: ev.clientX, y: ev.clientY }
        setSelectionRect({
          left: Math.min(startX, ev.clientX),
          top: Math.min(startY, ev.clientY),
          width: Math.abs(ev.clientX - startX),
          height: Math.abs(ev.clientY - startY),
        })
      }

      const onUp = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        isDraggingRef.current = false
        setSelectionRect(null)

        const start = dragStartRef.current
        const end = dragEndRef.current
        dragStartRef.current = null
        dragEndRef.current = null

        if (!start || !end) return

        const dx = Math.abs(end.x - start.x)
        const dy = Math.abs(end.y - start.y)

        if (dx > 5 || dy > 5) {
          dragHappenedRef.current = true

          const selLeft = Math.min(start.x, end.x)
          const selTop = Math.min(start.y, end.y)
          const selRight = Math.max(start.x, end.x)
          const selBottom = Math.max(start.y, end.y)

          const store = useDatasetStore.getState()
          const toSelect: string[] = []
          for (let i = 0; i < filteredItems.length; i++) {
            const r = getCardRect(i)
            if (!r) continue
            if (r.left < selRight && r.right > selLeft && r.top < selBottom && r.bottom > selTop) {
              toSelect.push(filteredItems[i].filename)
            }
          }

          if (toSelect.length > 0) {
            if (ev.ctrlKey || ev.metaKey) {
              for (const fn of toSelect) {
                store.toggleSelection(fn)
              }
            } else {
              store.setSelected(null)
              for (const fn of toSelect) {
                store.toggleSelection(fn)
              }
            }
          }
        }
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }

    container.addEventListener('pointerdown', onPointerDown)
    return () => {
      container.removeEventListener('pointerdown', onPointerDown)
    }
  }, [getCardRect])

  const total = useDatasetStore((s) => s.total)

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-auto p-4 select-none"
    >
      {filteredItems.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-center gap-3">
          {total === 0 ? (
            <>
              <FolderUp size={48} className="text-coal-600" aria-hidden="true" />
              <p className="font-display text-xl text-paper-muted">No frames loaded</p>
              <p className="font-mono text-sm text-paper-faint max-w-xs">Click <kbd className="border border-coal-600 px-1.5 rounded text-paper-muted">Open folder</kbd> in the toolbar to load a dataset</p>
            </>
          ) : (
            <>
              <Search size={48} className="text-coal-600" aria-hidden="true" />
              <p className="font-display text-xl text-paper-muted">No matching frames</p>
              <p className="font-mono text-sm text-paper-faint">Try adjusting the filter or search query</p>
            </>
          )}
        </div>
      )}
      {filteredItems.length > 0 && (<>
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualRow) => (
            <div
              key={virtualRow.key}
              className="grid gap-3"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
              }}
            >
              {Array.from({ length: cols }).map((_, col) => {
                const idx = virtualRow.index * cols + col
                const item = filteredItems[idx]
                if (!item) return <div key={col} />
                return (
                  <ImageCard
                    key={item.filename}
                    item={item}
                    index={idx}
                    isSelected={item.filename === selectedFilename}
                    isMultiSelected={selectedFilenames.includes(item.filename)}
                    onSelect={(e) => {
                      if (dragHappenedRef.current) {
                        dragHappenedRef.current = false
                        return
                      }
                      if (e.ctrlKey || e.metaKey) {
                        if (selectedFilename && selectedFilenames.length === 0 && item.filename !== selectedFilename) {
                          toggleSelection(selectedFilename)
                        }
                        toggleSelection(item.filename)
                      } else if (selectedFilenames.includes(item.filename)) {
                        toggleSelection(item.filename)
                      } else if (item.filename === selectedFilename) {
                        setSelected(null)
                      } else {
                        setSelected(item.filename)
                      }
                    }}
                  />
                )
              })}
            </div>
          ))}
        </div>
        {selectionRect && (
          <div
            className="fixed z-10 pointer-events-none"
            style={{
              left: selectionRect.left,
              top: selectionRect.top,
              width: selectionRect.width,
              height: selectionRect.height,
              backgroundColor: 'rgba(34, 211, 238, 0.08)',
              border: '1px solid rgba(34, 211, 238, 0.5)',
            }}
          />
        )}
      </>)}
    </div>
  )
}
