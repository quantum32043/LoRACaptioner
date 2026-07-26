import { useState, useEffect, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Save, Type } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../api/client'
import { useDatasetStore } from '../store/useDatasetStore'

function TagChip({ tag, onRemove, id }: { tag: string; onRemove: () => void; id: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  return (
    <span ref={setNodeRef} style={style} {...attributes} {...listeners} className="inline-flex items-center gap-1 px-2 py-0.5 bg-coal-700 text-paper rounded-md text-xs font-mono cursor-grab active:cursor-grabbing border border-coal-600">
      {tag}
      <button onClick={onRemove} className="text-paper-faint hover:text-ember ml-0.5">&times;</button>
    </span>
  )
}

export default function EditorPanel() {
  const items = useDatasetStore((s) => s.items)
  const selectedFilename = useDatasetStore((s) => s.selectedFilename)
  const setSelected = useDatasetStore((s) => s.setSelected)
  const updateItem = useDatasetStore((s) => s.updateItem)
  const total = useDatasetStore((s) => s.total)

  const selectedItem = items.find((i) => i.filename === selectedFilename)
  const [caption, setCaption] = useState('')
  const [tagMode, setTagMode] = useState(true)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (selectedItem) { setCaption(selectedItem.caption); setDirty(false) }
  }, [selectedItem])

  const selectedIdx = selectedItem ? items.indexOf(selectedItem) : -1

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: ({ filename, caption }: { filename: string; caption: string }) => api.saveCaption(filename, caption),
    onSuccess: () => { setDirty(false); if (selectedItem) updateItem(selectedItem.filename, caption) },
    onError: () => toast.error('Ошибка сохранения'),
  })

  const handleSave = () => { if (selectedItem) save({ filename: selectedItem.filename, caption }) }

  const handlePrev = () => { if (selectedIdx > 0) setSelected(items[selectedIdx - 1].filename) }
  const handleNext = () => { if (selectedIdx < items.length - 1) setSelected(items[selectedIdx + 1].filename) }

  const tags = caption.split(',').map((t) => t.trim()).filter(Boolean)

  const handleRemoveTag = (idx: number) => {
    const newTags = tags.filter((_, i) => i !== idx)
    setCaption(newTags.join(', '))
    setDirty(true)
  }

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const input = e.currentTarget
      const val = input.value.trim()
      if (val) { setCaption(caption ? `${caption}, ${val}` : val); setDirty(true) }
      input.value = ''
    }
  }

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); handleSave() }
    if (e.key === 'ArrowLeft' && document.activeElement?.tagName !== 'INPUT') handlePrev()
    if (e.key === 'ArrowRight' && document.activeElement?.tagName !== 'INPUT') handleNext()
  }, [selectedIdx, items, caption])

  useEffect(() => { window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown) }, [handleKeyDown])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  if (!selectedItem) {
    return (
      <aside className="w-[440px] border-l border-coal-700 bg-coal-900 flex items-center justify-center">
        <div className="text-center px-8">
          <p className="font-mono text-sm text-paper-muted mb-2">Выберите кадр</p>
          <p className="font-mono text-[10px] text-paper-faint">Кликните на изображение в сетке</p>
          <p className="font-mono text-[10px] text-paper-faint mt-1"><kbd className="border border-coal-600 px-1 rounded">←</kbd> <kbd className="border border-coal-600 px-1 rounded">→</kbd> навигация</p>
        </div>
      </aside>
    )
  }

  return (
    <aside className="w-[440px] border-l border-coal-700 bg-coal-900 flex flex-col overflow-hidden">
      <div className="px-4 py-2 border-b border-coal-700 flex items-center justify-between">
        <span className="font-mono text-xs text-paper-muted">кадр {selectedIdx + 1} / {total}</span>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dirty ? 'bg-safe animate-pulse shadow-[0_0_6px_#f5a02c]' : 'bg-cyano'}`} />
          <button onClick={() => setTagMode(!tagMode)} className="text-paper-faint hover:text-paper"><Type size={16} /></button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 px-2 py-1 text-xs font-mono bg-coal-800 border border-coal-600 rounded-md text-paper hover:bg-coal-700"><Save size={14} />{saving ? '...' : 'Сохранить'}</button>
        </div>
      </div>

      <div className="px-4 py-2 border-b border-coal-700">
        <p className="font-mono text-[10px] text-paper-faint">{selectedItem.filename}</p>
      </div>

      <div className="flex-1 overflow-hidden bg-coal-950">
        <TransformWrapper>
          <TransformComponent>
            <img src={selectedItem.full_url} alt={selectedItem.filename} className="w-full h-full object-contain" />
          </TransformComponent>
        </TransformWrapper>
      </div>

      <div className="px-4 py-3 border-t border-coal-700">
        {tagMode ? (
          <div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => {
              const { active, over } = e
              if (over && active.id !== over.id) {
                const oldIdx = tags.findIndex((_, i) => `tag-${i}` === active.id)
                const newIdx = tags.findIndex((_, i) => `tag-${i}` === over.id)
                if (oldIdx !== -1 && newIdx !== -1) {
                  const newTags = [...tags]
                  const [moved] = newTags.splice(oldIdx, 1)
                  newTags.splice(newIdx, 0, moved)
                  setCaption(newTags.join(', '))
                  setDirty(true)
                }
              }
            }}>
              <SortableContext items={tags.map((_, i) => `tag-${i}`)} strategy={horizontalListSortingStrategy}>
                <div className="flex flex-wrap gap-1 mb-2">
                  {tags.map((tag, i) => <TagChip key={`tag-${i}`} id={`tag-${i}`} tag={tag} onRemove={() => handleRemoveTag(i)} />)}
                </div>
              </SortableContext>
            </DndContext>
            <input
              type="text"
              placeholder="Добавить тег и Enter..."
              onKeyDown={handleAddTag}
              onKeyUp={(e) => { if (e.key === 'Backspace' && !e.currentTarget.value) { handleRemoveTag(tags.length - 1) } }}
              className="w-full bg-transparent text-sm text-paper placeholder-paper-faint outline-none font-mono"
            />
          </div>
        ) : (
          <textarea
            value={caption}
            onChange={(e) => { setCaption(e.target.value); setDirty(true) }}
            className="w-full h-32 bg-coal-800 text-paper text-sm font-mono p-2 rounded-md border border-coal-600 outline-none resize-none placeholder-paper-faint"
            placeholder="Введите капшен..."
          />
        )}
      </div>
    </aside>
  )
}