export default function FallbackPoster({ title }: { title: string }): JSX.Element {
  const initial = title.trim().charAt(0).toUpperCase() || '🎮'

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-accent/30 via-base-elevated to-base-bg p-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 font-tajawal text-2xl font-bold text-white">
        {initial}
      </span>
      <span className="line-clamp-3 font-tajawal text-sm font-bold leading-snug text-white/85">
        {title}
      </span>
    </div>
  )
}
