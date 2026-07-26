import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useDatasetStore } from '../store/useDatasetStore'
import ImageCard from './ImageCard'

export default function ImageGrid() {
  const items = useDatasetStore((s) => s.items)
  const setSelected = useDatasetStore((s) => s.setSelected)
  const selectedFilename = useDatasetStore((s) => s.selectedFilename)
  const parentRef = useRef<HTMLDivElement>(null)

  const cols = Math.max(2, Math.floor((parentRef.current?.clientWidth ?? 800) / 220))
  const rows = Math.ceil(items.length / cols)

  const virtualizer = useVirtualizer({
    count: rows,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 260,
    overscan: 3,
  })

  return (
    <div ref={parentRef} className="flex-1 overflow-auto p-4">
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
                  isSelected={item.filename === selectedFilename}
                  onSelect={() => setSelected(item.filename)}
                />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}