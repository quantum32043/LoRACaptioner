import { useRef, useState, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useDatasetStore } from '../store/useDatasetStore'
import ImageCard from './ImageCard'

export default function ImageGrid() {
  const items = useDatasetStore((s) => s.items)
  const setSelected = useDatasetStore((s) => s.setSelected)
  const selectedFilename = useDatasetStore((s) => s.selectedFilename)
  const selectedFilenames = useDatasetStore((s) => s.selectedFilenames)
  const toggleSelection = useDatasetStore((s) => s.toggleSelection)
  const parentRef = useRef<HTMLDivElement>(null)

  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [dragEnd, setDragEnd] = useState<{ x: number; y: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const cols = Math.max(1, Math.floor((parentRef.current?.clientWidth ?? 800) / 220))
  const rows = Math.ceil(items.length / cols)
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

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button')) return
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    setDragStart({ x: e.clientX, y: e.clientY })
    setDragEnd({ x: e.clientX, y: e.clientY })
    setIsDragging(true)
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return
    setDragEnd({ x: e.clientX, y: e.clientY })
  }, [isDragging])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging || !dragStart || !dragEnd) {
      setIsDragging(false)
      setDragStart(null)
      setDragEnd(null)
      return
    }

    const dx = Math.abs(dragEnd.x - dragStart.x)
    const dy = Math.abs(dragEnd.y - dragStart.y)
    if (dx > 5 || dy > 5) {
      const selLeft = Math.min(dragStart.x, dragEnd.x)
      const selTop = Math.min(dragStart.y, dragEnd.y)
      const selRight = Math.max(dragStart.x, dragEnd.x)
      const selBottom = Math.max(dragStart.y, dragEnd.y)

      const toSelect: string[] = []
      for (let i = 0; i < items.length; i++) {
        const r = getCardRect(i)
        if (!r) continue
        if (r.left < selRight && r.right > selLeft && r.top < selBottom && r.bottom > selTop) {
          toSelect.push(items[i].filename)
        }
      }

      if (toSelect.length > 0) {
        if (e.ctrlKey || e.metaKey) {
          for (const fn of toSelect) {
            toggleSelection(fn)
          }
        } else {
          setSelected(toSelect[0])
          for (let i = 1; i < toSelect.length; i++) {
            toggleSelection(toSelect[i])
          }
        }
      }
    }

    setIsDragging(false)
    setDragStart(null)
    setDragEnd(null)
  }, [isDragging, dragStart, dragEnd, items, cols, getCardRect, setSelected, toggleSelection])

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-auto p-4 select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
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
              const item = items[idx]
              if (!item) return <div key={col} />
              return (
                <ImageCard
                  key={item.filename}
                  item={item}
                  index={idx}
                  isSelected={item.filename === selectedFilename}
                  isMultiSelected={selectedFilenames.includes(item.filename)}
                  onSelect={(e) => {
                    if (e.ctrlKey || e.metaKey) {
                      if (selectedFilename && selectedFilenames.length === 0 && item.filename !== selectedFilename) {
                        toggleSelection(selectedFilename)
                      }
                      toggleSelection(item.filename)
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

      {isDragging && dragStart && dragEnd && (
        <div
          className="fixed z-10 pointer-events-none"
          style={{
            left: Math.min(dragStart.x, dragEnd.x),
            top: Math.min(dragStart.y, dragEnd.y),
            width: Math.abs(dragEnd.x - dragStart.x),
            height: Math.abs(dragEnd.y - dragStart.y),
            backgroundColor: 'rgba(34, 211, 238, 0.08)',
            border: '1px solid rgba(34, 211, 238, 0.5)',
          }}
        />
      )}
    </div>
  )
}
