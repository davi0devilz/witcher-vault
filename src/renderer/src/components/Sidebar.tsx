import { NavLink } from 'react-router-dom'
import iconUrl from '../assets/icon.png'
import {
  CompassIcon,
  DiceIcon,
  DiscordIcon,
  HeartIcon,
  HomeIcon,
  LibraryIcon,
  SettingsIcon,
  XIcon
} from './icons'

const SOCIAL_LINKS = [
  { label: 'حساب X', url: 'https://x.com/ibusqui', icon: XIcon },
  { label: 'سيرفر Discord', url: 'https://discord.gg/8435jMYK6k', icon: DiscordIcon }
]

interface NavItem {
  to: string
  label: string
  icon: (props: { className?: string }) => JSX.Element
}

const navItems: NavItem[] = [
  { to: '/', label: 'الرئيسية', icon: HomeIcon },
  { to: '/library', label: 'المكتبة', icon: LibraryIcon },
  { to: '/favorites', label: 'المفضلة', icon: HeartIcon },
  { to: '/steam-explorer', label: 'استكشاف Steam', icon: CompassIcon },
  { to: '/what-to-play', label: 'وش ألعب؟', icon: DiceIcon },
  { to: '/settings', label: 'الإعدادات', icon: SettingsIcon }
]

export default function Sidebar(): JSX.Element {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-l border-base-border bg-base-surface/80">
      <div className="flex items-center gap-3 px-6 py-6">
        <img src={iconUrl} alt="" className="h-9 w-9 rounded-lg" />
        <div>
          <h1 className="font-tajawal text-lg font-bold leading-tight text-white">Witcher Vault</h1>
          <p className="text-xs text-white/40">مكتبتك الشخصية</p>
        </div>
      </div>

      <nav className="mt-2 flex flex-1 flex-col gap-1 px-3">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              [
                'group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors duration-200',
                isActive
                  ? 'bg-accent/15 text-white shadow-glow'
                  : 'text-white/55 hover:bg-white/5 hover:text-white'
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={[
                    'h-5 w-5 transition-colors duration-200',
                    isActive ? 'text-accent-soft' : 'text-white/40 group-hover:text-white/70'
                  ].join(' ')}
                />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-col gap-3 px-6 pb-6 pt-2">
        <div className="flex items-center gap-2">
          {SOCIAL_LINKS.map(({ label, url, icon: Icon }) => (
            <button
              key={url}
              type="button"
              onClick={() => window.api.shell.openExternal(url)}
              title={label}
              aria-label={label}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/35 transition-colors duration-200 hover:bg-white/5 hover:text-accent-soft"
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        <p className="text-[11px] text-white/50">صُنع بـ ❤️ بواسطة Davi</p>
        <p className="text-[11px] leading-relaxed text-white/25">Witcher Vault — الإصدار 0.1.0</p>
      </div>
    </aside>
  )
}
