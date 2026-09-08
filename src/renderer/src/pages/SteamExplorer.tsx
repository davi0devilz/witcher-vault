import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { SteamSearchResultItem } from '../../../shared/models'

export default function SteamExplorer(): JSX.Element {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SteamSearchResultItem[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [openingAppId, setOpeningAppId] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setHasSearched(false)
      setIsSearching(false)
      return undefined
    }

    setIsSearching(true)
    debounceRef.current = setTimeout(async () => {
      const items = await window.api.steam.search(trimmed)
      setResults(items)
      setHasSearched(true)
      setIsSearching(false)
    }, 400)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  async function handleOpenGame(item: SteamSearchResultItem): Promise<void> {
    setOpeningAppId(item.appId)
    try {
      const gameId = await window.api.steam.ensureGameForApp(item.appId, item.name)
      navigate(`/game/${gameId}`)
    } finally {
      setOpeningAppId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="font-tajawal text-2xl font-bold text-white">🧭 استكشاف Steam</h2>
        <p className="mt-1 text-sm text-white/45">
          ابحث عن أي لعبة في متجر Steam مباشرةً — بدون الحاجة لامتلاكها أو تثبيتها أولاً.
        </p>
      </header>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ابحث باسم اللعبة... (مثال: Elden Ring)"
        autoFocus
        className="w-full rounded-2xl border border-base-border bg-base-surface px-4 py-3.5 text-sm text-white placeholder:text-white/30 focus:border-accent/60 focus:outline-none"
      />

      {isSearching && <p className="text-sm text-white/40">جارِ البحث...</p>}

      {!isSearching && hasSearched && results.length === 0 && (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-base-border bg-base-surface/60 text-center">
          <p className="font-tajawal text-base font-bold text-white/70">لا توجد نتائج</p>
          <p className="text-sm text-white/40">جرّب اسماً مختلفاً أو تأكد من الإملاء.</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {results.map((item) => (
            <button
              key={item.appId}
              type="button"
              onClick={() => handleOpenGame(item)}
              disabled={openingAppId === item.appId}
              className="group flex flex-col overflow-hidden rounded-xl border border-base-border bg-base-surface text-right transition-transform duration-300 ease-out hover:-translate-y-1 hover:shadow-glow disabled:cursor-wait disabled:opacity-70 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <div className="relative aspect-[460/215] w-full bg-base-elevated">
                {item.tinyImage ? (
                  <img
                    src={item.tinyImage}
                    alt={item.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl">🎮</div>
                )}
                {openingAppId === item.appId && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs text-white">
                    جارِ الفتح...
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-3">
                <h3 className="line-clamp-2 font-tajawal text-xs font-bold text-white">
                  {item.name}
                </h3>
                {item.priceFinal !== null && (
                  <span className="text-[11px] text-white/50">
                    {item.priceFinal.toFixed(2)} {item.priceCurrency}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
