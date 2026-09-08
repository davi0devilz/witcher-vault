import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { FavoriteGameItem } from '../../../shared/models'
import FallbackPoster from '../components/FallbackPoster'

export default function Favorites(): JSX.Element {
  const [items, setItems] = useState<FavoriteGameItem[] | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.favorites.getGames().then((games) => {
      if (!cancelled) setItems(games)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="font-tajawal text-2xl font-bold text-white">⭐ المفضلة</h2>
        <p className="mt-1 text-sm text-white/45">
          الألعاب التي أضفتها للمفضلة — من مكتبتك أو من مستكشف Steam لمتابعة أسعارها.
        </p>
      </header>

      {items === null && <p className="text-sm text-white/40">جارِ التحميل...</p>}

      {items !== null && items.length === 0 && (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-base-border bg-base-surface/60 text-center">
          <p className="font-tajawal text-base font-bold text-white/70">لا توجد ألعاب مفضلة بعد</p>
          <p className="text-sm text-white/40">
            اضغط زر المفضلة داخل صفحة أي لعبة لإضافتها هنا.
          </p>
        </div>
      )}

      {items !== null && items.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {items.map((item) => (
            <FavoriteCard key={item.gameId} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

function FavoriteCard({ item }: { item: FavoriteGameItem }): JSX.Element {
  const [coverFailed, setCoverFailed] = useState(false)

  return (
    <Link
      to={`/game/${item.gameId}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-base-border bg-base-surface text-right transition-transform duration-300 ease-out hover:-translate-y-1 hover:shadow-glow motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <div className="relative aspect-[2/3] w-full bg-base-elevated">
        {item.coverPath && !coverFailed ? (
          <img
            src={`app-artwork://local/${item.coverPath}`}
            alt={item.title}
            loading="lazy"
            onError={() => setCoverFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <FallbackPoster title={item.title} />
        )}
        {item.isOwned && (
          <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[10px] font-bold text-white backdrop-blur">
            في مكتبتك
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <h3 className="line-clamp-2 font-tajawal text-xs font-bold text-white">{item.title}</h3>
        {!item.isOwned && (
          <span className="text-[11px] font-medium text-accent">
            {item.isFree
              ? 'مجاني'
              : item.priceFinal !== null
                ? `${item.priceFinal.toFixed(2)} ${item.priceCurrency ?? ''}`
                : '—'}
          </span>
        )}
      </div>
    </Link>
  )
}
