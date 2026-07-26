import { type Item } from '../api/client'

export default function ImageCard({ item, index, isSelected, onSelect }: { item: Item; index: number; isSelected: boolean; onSelect: () => void }) {
  const num = item.filename.match(/\d+/)?.[0].padStart(4, '0') || '0000'
  return (
    <button
      onClick={onSelect}
      className={`group relative flex flex-col rounded-md overflow-hidden border transition-all stagger-fade-up ${
        isSelected ? 'border-safe ring-1 ring-safe/50 translate-y-[-2px]' : 'border-coal-700 hover:border-coal-500'
      }`}
      style={{ animationDelay: `${(index % 20) * 30}ms` }}
    >
      <div className="h-6 bg-coal-800 flex items-center px-2 border-b border-coal-700">
        <span className="font-mono text-xs uppercase tracking-wider text-paper-faint group-hover:text-safe transition-colors">FR·{num}</span>
      </div>
      <div className="aspect-[4/3] bg-coal-800 overflow-hidden">
        <img src={item.thumb_url} alt={item.filename} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
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