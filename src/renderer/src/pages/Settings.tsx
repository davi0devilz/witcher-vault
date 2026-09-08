import { useEffect, useState } from 'react'
import type { UpdateEvent } from '../../../shared/models'
import {
  applyFontSize,
  FONT_SIZE_META_KEY,
  isFontSizeOption,
  type FontSizeOption
} from '../lib/fontSize'

const STEAMGRIDDB_KEY_META_KEY = 'steamgriddb_api_key'
const STEAM_API_KEY_META_KEY = 'steam_api_key'
const STEAM_PROFILE_INPUT_META_KEY = 'steam_profile_input'

const FONT_SIZE_OPTIONS: Array<{ value: FontSizeOption; label: string }> = [
  { value: 'small', label: 'صغير' },
  { value: 'medium', label: 'متوسط' },
  { value: 'large', label: 'كبير' }
]

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'up-to-date' }
  | { phase: 'available'; version: string }
  | { phase: 'downloading'; version: string; percent: number }
  | { phase: 'downloaded'; version: string }
  | { phase: 'error'; message: string }

export default function Settings(): JSX.Element {
  const [apiKey, setApiKey] = useState('')
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [fontSize, setFontSize] = useState<FontSizeOption>('medium')
  const [appVersion, setAppVersion] = useState('')
  const [updateState, setUpdateState] = useState<UpdateState>({ phase: 'idle' })

  const [steamProfileInput, setSteamProfileInput] = useState('')
  const [steamApiKey, setSteamApiKey] = useState('')
  const [isSteamSyncing, setIsSteamSyncing] = useState(false)
  const [steamSyncMessage, setSteamSyncMessage] = useState<{ ok: boolean; text: string } | null>(
    null
  )

  useEffect(() => {
    let cancelled = false

    async function loadSettings(): Promise<void> {
      const [value, storedFontSize, storedSteamProfile, storedSteamApiKey] = await Promise.all([
        window.api.db.getMeta(STEAMGRIDDB_KEY_META_KEY),
        window.api.db.getMeta(FONT_SIZE_META_KEY),
        window.api.db.getMeta(STEAM_PROFILE_INPUT_META_KEY),
        window.api.db.getMeta(STEAM_API_KEY_META_KEY)
      ])
      if (!cancelled) {
        setSavedKey(value)
        setApiKey(value ?? '')
        if (isFontSizeOption(storedFontSize)) setFontSize(storedFontSize)
        setSteamProfileInput(storedSteamProfile ?? '')
        setSteamApiKey(storedSteamApiKey ?? '')
        setIsLoading(false)
      }
    }

    loadSettings()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSyncSteamLibrary(): Promise<void> {
    setIsSteamSyncing(true)
    setSteamSyncMessage(null)
    try {
      const result = await window.api.steam.syncLibrary(steamProfileInput)
      setSteamSyncMessage({ ok: result.ok, text: result.message })
    } finally {
      setIsSteamSyncing(false)
    }
  }

  async function handleSaveSteamApiKey(): Promise<void> {
    await window.api.db.setMeta(STEAM_API_KEY_META_KEY, steamApiKey.trim())
  }

  useEffect(() => {
    window.api.getAppVersion().then(setAppVersion)
  }, [])

  useEffect(() => {
    return window.api.updater.onUpdateEvent((event: UpdateEvent) => {
      setUpdateState((prev) => {
        switch (event.type) {
          case 'checking-for-update':
            return { phase: 'checking' }
          case 'update-available':
            return { phase: 'available', version: event.version }
          case 'update-not-available':
            return { phase: 'up-to-date' }
          case 'download-progress': {
            let version = ''
            if (prev.phase === 'downloading' || prev.phase === 'available') version = prev.version
            return { phase: 'downloading', version, percent: event.percent }
          }
          case 'update-downloaded':
            return { phase: 'downloaded', version: event.version }
          case 'error':
            return { phase: 'error', message: event.message }
          default:
            return prev
        }
      })
    })
  }, [])

  async function handleCheckForUpdates(): Promise<void> {
    setUpdateState({ phase: 'checking' })
    await window.api.updater.checkForUpdates()
  }

  async function handleStartDownload(): Promise<void> {
    if (updateState.phase !== 'available') return
    setUpdateState({ phase: 'downloading', version: updateState.version, percent: 0 })
    await window.api.updater.startDownload()
  }

  function handleDismissUpdate(): void {
    setUpdateState({ phase: 'idle' })
  }

  async function handleInstallUpdate(): Promise<void> {
    await window.api.updater.installUpdate()
  }

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
        <h3 className="font-tajawal text-sm font-bold text-white">☁️ مكتبة Steam السحابية</h3>
        <p className="mt-1 text-xs leading-relaxed text-white/45">
          اسحب كل الألعاب المملوكة في حسابك على Steam — حتى غير المثبتة على هذا الجهاز — لتظهر في
          مكتبتك مع كل تفاصيلها.
        </p>

        {!isLoading && (
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              type="text"
              value={steamProfileInput}
              onChange={(e) => setSteamProfileInput(e.target.value)}
              placeholder="معرّف رقمي (SteamID64) أو اسم مخصص أو رابط بروفايلك"
              dir="ltr"
              className="min-w-[260px] flex-1 rounded-lg border border-base-border bg-base-elevated px-3 py-2 text-right text-sm text-white placeholder:text-white/30 focus:border-accent/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSyncSteamLibrary}
              disabled={isSteamSyncing || !steamProfileInput.trim()}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white transition-colors duration-200 hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSteamSyncing ? 'جارِ المزامنة...' : '🔄 حفظ ومزامنة الألعاب'}
            </button>
          </div>
        )}

        {steamSyncMessage && (
          <p
            className={[
              'mt-2 text-xs leading-relaxed',
              steamSyncMessage.ok ? 'text-emerald-400/80' : 'text-red-400/80'
            ].join(' ')}
          >
            {steamSyncMessage.ok ? '✓ ' : '⚠ '}
            {steamSyncMessage.text}
          </p>
        )}

        <div className="mt-4 rounded-xl border border-base-border bg-base-elevated p-4">
          <h4 className="text-xs font-bold text-white/70">قبل المزامنة</h4>
          <ol className="mt-2 flex flex-col gap-1.5 text-xs leading-relaxed text-white/50">
            <li>
              1. تأكد أن خصوصية ملفك الشخصي على Steam و"تفاصيل الألعاب" (Game details) محددة على
              "عام / Public" — من: Steam ← الملف الشخصي ← تعديل الملف الشخصي ← إعدادات الخصوصية.
            </li>
            <li>
              2. يمكنك كتابة اسم حسابك المخصص فقط (الموجود في رابط بروفايلك)، أو نسخ رابط
              بروفايلك كاملاً من Steam وسيتعرف عليه البرنامج تلقائياً.
            </li>
          </ol>
        </div>

        <details className="mt-3 text-xs text-white/40">
          <summary className="cursor-pointer select-none text-white/50 hover:text-white/70">
            مفتاح Steam Web API خاص بك (اختياري)
          </summary>
          <p className="mt-2 leading-relaxed">
            يعمل التطبيق افتراضياً بمفتاح مشترك، لكن يمكنك استخدام مفتاحك الخاص المجاني من{' '}
            <button
              type="button"
              onClick={() =>
                window.api.shell.openExternal('https://steamcommunity.com/dev/apikey')
              }
              className="text-accent-soft hover:underline"
            >
              steamcommunity.com/dev/apikey
            </button>{' '}
            إن رغبت — اتركها فارغة لاستخدام المفتاح الافتراضي.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              type="password"
              value={steamApiKey}
              onChange={(e) => setSteamApiKey(e.target.value)}
              placeholder="مفتاحك الخاص (اختياري)"
              dir="ltr"
              className="min-w-[220px] flex-1 rounded-lg border border-base-border bg-base-elevated px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-accent/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSaveSteamApiKey}
              className="rounded-lg border border-base-border bg-base-surface px-4 py-2 text-sm font-bold text-white/80 transition-colors duration-200 hover:border-accent/40 hover:text-white"
            >
              حفظ
            </button>
          </div>
        </details>
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

      <div className="rounded-2xl border border-base-border bg-base-surface p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-tajawal text-sm font-bold text-white">التحديثات</h3>
            <p className="mt-1 text-xs leading-relaxed text-white/45">
              الإصدار الحالي: <span className="text-white/60">v{appVersion || '—'}</span>
            </p>
          </div>
          {updateState.phase !== 'available' &&
            updateState.phase !== 'downloading' &&
            updateState.phase !== 'downloaded' && (
              <button
                type="button"
                onClick={handleCheckForUpdates}
                disabled={updateState.phase === 'checking'}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white transition-colors duration-200 hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
              >
                {updateState.phase === 'checking' ? 'جارٍ التحقق...' : 'التحقق من وجود تحديثات'}
              </button>
            )}
        </div>

        {updateState.phase === 'up-to-date' && (
          <p className="mt-3 text-xs text-emerald-400/80">✓ التطبيق محدّث لأحدث إصدار.</p>
        )}

        {updateState.phase === 'error' && (
          <p className="mt-3 text-xs text-red-400/80">تعذّر التحقق من التحديثات: {updateState.message}</p>
        )}

        {updateState.phase === 'available' && (
          <div className="mt-4 rounded-xl border border-accent/40 bg-accent/10 p-4">
            <p className="text-sm font-bold text-white">
              يتوفر إصدار جديد: <span className="text-accent-soft">v{updateState.version}</span>
            </p>
            <p className="mt-1 text-xs text-white/50">
              يمكنك تحميل التحديث الآن أو تجاهله والمتابعة لاحقاً.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleStartDownload}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white transition-colors duration-200 hover:bg-accent-soft"
              >
                تحديث الآن
              </button>
              <button
                type="button"
                onClick={handleDismissUpdate}
                className="rounded-lg border border-base-border bg-base-elevated px-4 py-2 text-sm font-bold text-white/60 transition-colors duration-200 hover:text-white"
              >
                لاحقاً / تجاهل
              </button>
            </div>
          </div>
        )}

        {updateState.phase === 'downloading' && (
          <div className="mt-4 rounded-xl border border-accent/40 bg-accent/10 p-4">
            <p className="text-sm font-bold text-white">جارِ تحميل التحديث...</p>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-base-elevated">
              <div
                className="h-full rounded-full bg-accent transition-all duration-200"
                style={{ width: `${Math.round(updateState.percent)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-white/50">{Math.round(updateState.percent)}%</p>
          </div>
        )}

        {updateState.phase === 'downloaded' && (
          <div className="mt-4 rounded-xl border border-accent/40 bg-accent/10 p-4">
            <p className="text-sm font-bold text-white">
              تم تحميل الإصدار <span className="text-accent-soft">v{updateState.version}</span> بنجاح.
            </p>
            <p className="mt-1 text-xs text-white/50">أعد تشغيل التطبيق لإكمال التثبيت.</p>
            <button
              type="button"
              onClick={handleInstallUpdate}
              className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white transition-colors duration-200 hover:bg-accent-soft"
            >
              إعادة التشغيل والتثبيت
            </button>
          </div>
        )}
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
