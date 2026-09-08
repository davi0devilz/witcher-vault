import { useEffect, useState } from 'react'
import {
  applyFontSize,
  FONT_SIZE_META_KEY,
  isFontSizeOption,
  type FontSizeOption
} from '../lib/fontSize'

const STEAMGRIDDB_KEY_META_KEY = 'steamgriddb_api_key'

const FONT_SIZE_OPTIONS: Array<{ value: FontSizeOption; label: string }> = [
  { value: 'small', label: 'صغير' },
  { value: 'medium', label: 'متوسط' },
  { value: 'large', label: 'كبير' }
]

export default function Settings(): JSX.Element {
  const [apiKey, setApiKey] = useState('')
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [fontSize, setFontSize] = useState<FontSizeOption>('medium')

  useEffect(() => {
    let cancelled = false

    async function loadSettings(): Promise<void> {
      const [value, storedFontSize] = await Promise.all([
        window.api.db.getMeta(STEAMGRIDDB_KEY_META_KEY),
        window.api.db.getMeta(FONT_SIZE_META_KEY)
      ])
      if (!cancelled) {
        setSavedKey(value)
        setApiKey(value ?? '')
        if (isFontSizeOption(storedFontSize)) setFontSize(storedFontSize)
        setIsLoading(false)
      }
    }

    loadSettings()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleFontSizeChange(size: FontSizeOption): Promise<void> {
    setFontSize(size)
    applyFontSize(size)
    await window.api.db.setMeta(FONT_SIZE_META_KEY, size)
  }

  async function handleSave(): Promise<void> {
    setIsSaving(true)
    try {
      await window.api.db.setMeta(STEAMGRIDDB_KEY_META_KEY, apiKey.trim())
      setSavedKey(apiKey.trim())
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="font-tajawal text-2xl font-bold text-white">الإعدادات</h2>
        <p className="mt-1 text-sm text-white/45">إدارة تفضيلات التطبيق ومساراته.</p>
      </header>

      <div className="flex flex-col gap-4">
        <SettingRow title="اللغة والاتجاه" value="العربية — من اليمين لليسار" />
        <SettingRow title="الثيم" value="داكن سينمائي" />
        <SettingRow title="مكان قاعدة البيانات" value="مجلد بيانات المستخدم (userData)" />
      </div>

      <div className="rounded-2xl border border-base-border bg-base-surface p-5">
        <h3 className="font-tajawal text-sm font-bold text-white">حجم الخط</h3>
        <p className="mt-1 text-xs leading-relaxed text-white/45">
          يتحكم في حجم كل النصوص داخل التطبيق — العناوين، الأوصاف، والقوائم.
        </p>
        <div className="mt-3 flex gap-2">
          {FONT_SIZE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleFontSizeChange(opt.value)}
              className={[
                'flex-1 rounded-xl border px-4 py-2.5 text-sm font-bold transition-colors duration-200',
                fontSize === opt.value
                  ? 'border-accent bg-accent/15 text-white'
                  : 'border-base-border bg-base-elevated text-white/60 hover:border-accent/40 hover:text-white'
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-base-border bg-base-surface p-5">
        <h3 className="font-tajawal text-sm font-bold text-white">مفتاح SteamGridDB API</h3>
        <p className="mt-1 text-xs leading-relaxed text-white/45">
          أضف مفتاحك المجاني من{' '}
          <span className="text-white/60">steamgriddb.com</span> لعرض تصاميم أغلفة إضافية من
          مجتمع اللاعبين عند تعديل غلاف أي لعبة. اختياري — تبقى الخيارات الرسمية من Steam متاحة
          دائماً دون الحاجة لمفتاح.
        </p>

        {!isLoading && (
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="الصق مفتاح API هنا"
              className="min-w-[240px] flex-1 rounded-lg border border-base-border bg-base-elevated px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-accent/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || apiKey === (savedKey ?? '')}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white transition-colors duration-200 hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? 'جارِ الحفظ...' : 'حفظ'}
            </button>
          </div>
        )}
        {savedKey && <p className="mt-2 text-xs text-emerald-400/80">✓ تم حفظ المفتاح.</p>}

        <div className="mt-4 rounded-xl border border-base-border bg-base-elevated p-4">
          <button
            type="button"
            onClick={() => window.api.shell.openExternal('https://www.steamgriddb.com')}
            className="text-sm font-bold text-accent-soft transition-colors duration-200 hover:text-accent"
          >
            فتح موقع SteamGridDB ↗
          </button>

          <h4 className="mt-3 text-xs font-bold text-white/70">خطوات استخراج المفتاح</h4>
          <ol className="mt-2 flex flex-col gap-1.5 text-xs leading-relaxed text-white/50">
            <li>1. سجّل دخولك في الموقع عبر حسابك في Steam.</li>
            <li>2. اضغط على أيقونة صورتك الشخصية في الزاوية العلوية.</li>
            <li>3. اختر Preferences من القائمة.</li>
            <li>4. توجّه إلى تبويب API.</li>
            <li>5. انسخ الرمز والصقه هنا في البرنامج.</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

function SettingRow({ title, value }: { title: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-base-border bg-base-surface px-5 py-4">
      <span className="text-sm font-medium text-white/80">{title}</span>
      <span className="text-sm text-white/40">{value}</span>
    </div>
  )
}
