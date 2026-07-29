import { AlertCircle, AlertTriangle } from 'lucide-react'
import { type Item } from '../api/client'
import { useDatasetStore } from '../store/useDatasetStore'

export default function ImageCard({ item, index, isSelected, isMultiSelected, onSelect }: { item: Item; index: number; isSelected: boolean; isMultiSelected: boolean; onSelect: (e: React.MouseEvent) => void }) {
  const triggerResults = useDatasetStore((s) => s.triggerResults)
  const triggerWords = useDatasetStore((s) => s.triggerWords)
  const tr = triggerWords.length > 0 ? triggerResults[item.filename] : undefined
  const num = item.filename.match(/\d+/)?.[0].padStart(4, '0') || '0000'
  const borderClass = isMultiSelected
    ? 'border-cyano ring-1 ring-cyano/50'
    : isSelected
      ? 'border-safe ring-1 ring-safe/50 translate-y-[-2px]'
      : 'border-coal-700 hover:border-coal-500'
  return (
    <button
      onClick={onSelect}
      className={`group relative flex flex-col rounded-md overflow-hidden border transition-all stagger-fade-up ${borderClass}`}
      style={{ animationDelay: `${(index % 20) * 30}ms` }}
    >
      {isMultiSelected && (
        <div className="absolute top-2 right-2 z-10 w-5 h-5 bg-cyano rounded-full flex items-center justify-center shadow-lg">
          <span className="text-coal-950 text-xs font-bold leading-none">&#10003;</span>
        </div>
      )}
      {tr && tr.status !== 'exact' && (
        <div className={`absolute top-2 left-2 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-mono font-bold border-2 shadow-xl ${
          tr.status === 'missing'
            ? 'bg-ember text-white border-ember/80'
            : 'bg-safe text-coal-950 border-safe/80'
        }`}>
          {tr.status === 'missing' ? <AlertCircle size={16} /> : <AlertTriangle size={16} />}
          <span>{tr.status === 'missing' ? 'НЕТ' : 'ОШИБКА'}</span>
        </div>
      )}
      <div className="h-6 bg-coal-800 flex items-center px-2 border-b border-coal-700">
        <span className="font-mono text-xs uppercase tracking-wider text-paper-faint group-hover:text-safe transition-colors">FR·{num}</span>
      </div>
      <div className="aspect-[4/3] bg-coal-800 overflow-hidden">
        <img src={item.thumb_url} alt={item.filename} loading="lazy" draggable={false} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
      </div>
      <div className="p-2 bg-coal-900 border-t border-coal-700">
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className={`w-2 h-2 rounded-full ${item.tagged ? 'bg-cyano shadow-[0_0_4px_#5fc6d0]' : 'bg-safe animate-pulse shadow-[0_0_6px_#f5a02c]'}`} />
          <span className="font-mono text-xs text-paper-faint truncate">{item.filename}</span>
        </div>
        <p className="font-mono text-xs text-paper-muted leading-snug line-clamp-2">
          {item.caption || <span className="text-safe/60 italic">без капшена</span>}
        </p>
      </div>
    </button>
  )
}