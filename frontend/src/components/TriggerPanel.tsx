import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Target, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react'
import { api, type TriggerCheckStats, type TriggerCheckResult } from '../api/client'
import { useDatasetStore } from '../store/useDatasetStore'

function normalize(s: string) {
  return s.toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
}

function checkTriggerWords(items: { caption: string }[], triggerWords: string[], expectedPos: number): TriggerCheckStats {
  const warnBuckets: Record<string, { count: number; examples: Set<string> }> = { case: { count: 0, examples: new Set() }, separator: { count: 0, examples: new Set() }, position: { count: 0, examples: new Set() } }
  let exact = 0
  let missing = 0

  for (const item of items) {
    const tags = item.caption.split(',').map((t) => t.trim()).filter(Boolean)
    const tagAtPos = tags[expectedPos]
    let status: TriggerCheckResult['status'] = 'missing'
    let variant: string | null = null

    if (tagAtPos) {
      for (const tw of triggerWords) {
        const tws = tw.trim()
        if (!tws) continue
        if (tagAtPos === tws) { status = 'exact'; break }
        if (tagAtPos.toLowerCase() === tws.toLowerCase()) { status = 'case'; variant = tagAtPos; break }
        if (normalize(tagAtPos) === normalize(tws)) { status = 'separator'; variant = tagAtPos; break }
      }
    }

    if (status === 'missing' || status === 'exact') {
      // already determined
    }

    if (status === 'missing') {
      for (const tw of triggerWords) {
        const tws = tw.trim()
        if (!tws) continue
        const idx = tags.findIndex((t, i) => i !== expectedPos && t.toLowerCase() === tws.toLowerCase())
        if (idx !== -1) {
          status = 'position'
          variant = tags[idx] !== tws ? tags[idx] : null
          break
        }
      }
    }

    if (status === 'exact') exact++
    else if (status === 'missing') missing++
    else {
      const bucket = warnBuckets[status]
      bucket.count++
      if (variant) bucket.examples.add(variant)
    }
  }

  const warnings: TriggerCheckStats['warnings'] = []
  for (const type of ['case', 'separator', 'position'] as const) {
    if (warnBuckets[type].count > 0) {
      warnings.push({ type, count: warnBuckets[type].count, examples: Array.from(warnBuckets[type].examples).slice(0, 5) })
    }
  }

  return { total: items.length, exact, warnings, missing }
}

export default function TriggerPanel() {
  const items = useDatasetStore((s) => s.items)
  const triggerWords = useDatasetStore((s) => s.triggerWords)
  const triggerPosition = useDatasetStore((s) => s.triggerPosition)
  const triggerCheckStats = useDatasetStore((s) => s.triggerCheckStats)
  const setTriggerWords = useDatasetStore((s) => s.setTriggerWords)
  const setTriggerPosition = useDatasetStore((s) => s.setTriggerPosition)
  const setTriggerCheckStats = useDatasetStore((s) => s.setTriggerCheckStats)

  const [inputValue, setInputValue] = useState('')
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [addPosition, setAddPosition] = useState<'prepend' | 'append'>('prepend')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [onlyUntagged, setOnlyUntagged] = useState(false)
  const queryClient = useQueryClient()

  const posLabels = ['первый', 'второй', 'третий', 'четвёртый', 'пятый']

  const handleAddTrigger = () => {
    const val = inputValue.trim()
    if (!val || triggerWords.includes(val)) return
    setTriggerWords([...triggerWords, val])
    setInputValue('')
  }

  const handleRemoveTrigger = (idx: number) => {
    setTriggerWords(triggerWords.filter((_, i) => i !== idx))
  }

  const handleEditTrigger = (idx: number) => {
    setEditingIdx(idx)
    setEditValue(triggerWords[idx])
  }

  const handleEditCommit = (idx: number) => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== triggerWords[idx]) {
      const next = [...triggerWords]
      next[idx] = trimmed
      setTriggerWords(next)
    }
    setEditingIdx(null)
  }

  const handleCheck = () => {
    if (triggerWords.length === 0) return
    const result = checkTriggerWords(items, triggerWords, triggerPosition)
    setTriggerCheckStats(result)
  }

  const { mutate: runAdd, isPending } = useMutation({
    mutationFn: () => {
      let filenames: string[] | undefined
      if (onlyMissing && triggerCheckStats) {
        const missingFns = items.filter((item) => {
          const tags = item.caption.split(',').map((t) => t.trim()).filter(Boolean)
          const tagAtPos = tags[triggerPosition]
          let has = false
          for (const tw of triggerWords) {
            const tws = tw.trim()
            if (!tws) continue
            if (tagAtPos === tws) { has = true; break }
            if (tagAtPos?.toLowerCase() === tws.toLowerCase()) { has = true; break }
            if (normalize(tagAtPos || '') === normalize(tws)) { has = true; break }
          }
          if (!has) {
            for (const tw of triggerWords) {
              const tws = tw.trim()
              if (!tws) continue
              if (tags.some((t, i) => i !== triggerPosition && t.toLowerCase() === tws.toLowerCase())) { has = true; break }
            }
          }
          return !has
        }).map((i) => i.filename)
        if (missingFns.length === 0) throw new Error('no_missing')
        filenames = missingFns
      }
      return api.triggerAdd({ trigger_words: triggerWords, position: addPosition, filenames: filenames || null, only_untagged: onlyUntagged })
    },
    onSuccess: (data) => {
      toast.success(`Триггер добавлен в ${data.changed} из ${data.total} файлов`)
      setTriggerCheckStats(null)
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (err) => {
      if (err instanceof Error && err.message === 'no_missing') {
        toast.info('Все файлы уже содержат триггер')
      } else {
        toast.error('Ошибка при добавлении триггера')
      }
    },
  })

  return (
    <div className="px-4 py-3 border-b border-coal-700 bg-coal-850">
      <div className="flex items-center gap-2 mb-2">
        <Target size={16} className="text-safe shrink-0" />
        <span className="font-mono text-xs text-paper uppercase tracking-wider">Trigger words</span>
      </div>

      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {triggerWords.map((word, i) =>
          editingIdx === i ? (
            <input
              key={i}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleEditCommit(i) }
                if (e.key === 'Escape') setEditingIdx(null)
              }}
              onBlur={() => handleEditCommit(i)}
              autoFocus
              className="inline-flex px-2 py-0.5 rounded-md text-xs font-mono border border-cyano bg-coal-900 text-paper outline-none w-28"
            />
          ) : (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-coal-700 text-paper rounded-md text-xs font-mono border border-coal-600">
              <span className="cursor-pointer hover:text-cyano" onClick={() => handleEditTrigger(i)}>{word}</span>
              <button onClick={() => handleRemoveTrigger(i)} className="text-paper-faint hover:text-ember ml-0.5">&times;</button>
            </span>
          )
        )}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTrigger() } }}
          placeholder="добавить триггер..."
          className="bg-transparent text-sm text-paper placeholder-paper-faint outline-none font-mono flex-1 min-w-24"
        />
      </div>

      <div className="flex items-center gap-3 flex-wrap mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-paper-muted">Позиция:</span>
          <select
            value={triggerPosition}
            onChange={(e) => setTriggerPosition(Number(e.target.value))}
            className="bg-coal-800 text-paper text-xs font-mono border border-coal-600 rounded-md px-2 py-1"
          >
            {Array.from({ length: 10 }, (_, i) => (
              <option key={i} value={i}>{posLabels[i] || `${i + 1}-й`} ({i})</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleCheck}
          disabled={triggerWords.length === 0}
          className="px-3 py-1 text-xs font-mono uppercase tracking-wider bg-cyano/20 text-cyano border border-cyano/50 rounded-md hover:bg-cyano/30 disabled:opacity-50"
        >
          Проверить
        </button>
      </div>

      {triggerCheckStats && (
        <div className="space-y-1.5 mb-2">
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-cyano flex items-center gap-1"><CheckCircle size={12} />{triggerCheckStats.exact}</span>
            <span className="text-paper-faint">/</span>
            <span className="text-paper-muted">{triggerCheckStats.total}</span>
            {triggerCheckStats.exact === triggerCheckStats.total && (
              <span className="text-cyano text-[10px] tracking-wider uppercase">— все ок</span>
            )}
          </div>

          {triggerCheckStats.warnings.map((w) => (
            <div key={w.type} className="flex items-center gap-1.5 text-xs font-mono text-safe">
              <AlertTriangle size={12} />
              <span>
                {w.type === 'case' ? 'Другой регистр' : w.type === 'separator' ? 'Разделитель' : 'Позиция'}
                : {w.count} файлов
              </span>
              {w.examples.length > 0 && (
                <span className="text-paper-faint">({w.examples.join(', ')})</span>
              )}
            </div>
          ))}

          {triggerCheckStats.missing > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-mono text-ember">
              <AlertCircle size={12} />
              <span>Отсутствует: {triggerCheckStats.missing} файлов</span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap pt-1 border-t border-coal-700/50">
        <select
          value={addPosition}
          onChange={(e) => setAddPosition(e.target.value as 'prepend' | 'append')}
          className="bg-coal-800 text-paper text-xs font-mono border border-coal-600 rounded-md px-2 py-1"
        >
          <option value="prepend">В начало</option>
          <option value="append">В конец</option>
        </select>

        <label className="flex items-center gap-1.5 text-xs font-mono text-paper-muted cursor-pointer">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} className="accent-safe" />
          только без триггера
        </label>

        <label className="flex items-center gap-1.5 text-xs font-mono text-paper-muted cursor-pointer">
          <input type="checkbox" checked={onlyUntagged} onChange={(e) => setOnlyUntagged(e.target.checked)} className="accent-safe" />
          только пустые
        </label>

        <button
          onClick={() => runAdd()}
          disabled={triggerWords.length === 0 || isPending}
          className="px-4 py-1.5 text-xs font-mono uppercase tracking-wider bg-safe text-coal-950 rounded-md font-semibold disabled:opacity-50"
        >
          {isPending ? '...' : 'Добавить'}
        </button>
      </div>
    </div>
  )
}
