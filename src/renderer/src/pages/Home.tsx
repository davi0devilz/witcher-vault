import { useEffect, useState } from 'react'

interface SystemInfo {
  appVersion: string
  dbPath: string
}

export default function Home(): JSX.Element {
  const [info, setInfo] = useState<SystemInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadSystemInfo(): Promise<void> {
      try {
        const [appVersion, dbPath] = await Promise.all([
          window.api.getAppVersion(),
          window.api.db.getPath()
        ])
        if (!cancelled) setInfo({ appVersion, dbPath })
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    }

    loadSystemInfo()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex flex-col gap-8">
      <section className="relative overflow-hidden rounded-3xl border border-base-border bg-gradient-to-l from-accent/15 via-base-surface to-base-surface p-10">
        <p className="mb-2 text-sm font-medium text-accent-soft">أهلاً بك مجدداً</p>
        <h2 className="mb-3 font-tajawal text-3xl font-bold text-white">مكتبة ألعابك بانتظارك</h2>
        <p className="max-w-xl text-sm leading-relaxed text-white/60">
          هذه لوحة التحكم الرئيسية في Witcher Vault. بمجرد إضافة ألعابك في المراحل القادمة، ستظهر
          هنا آخر لعبة لُعبت، الألعاب قيد اللعب، والمفضلة لديك.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <PlaceholderCard title="🎮 كمّل لعبك" description="الألعاب التي بدأتها ولم تُكملها بعد." />
        <PlaceholderCard title="🕒 لُعبت مؤخراً" description="سجل أحدث جلسات اللعب لديك." />
        <PlaceholderCard title="⭐ المفضلة" description="ألعابك المفضلة في مكان واحد." />
      </section>

      <section className="rounded-2xl border border-base-border bg-base-surface p-6">
        <h3 className="mb-3 font-tajawal text-base font-bold text-white">حالة النظام</h3>
        {error && <p className="text-sm text-red-400">تعذّر الاتصال بالنظام: {error}</p>}
        {!error && !info && <p className="text-sm text-white/40">جارِ التحقق من قاعدة البيانات...</p>}
        {info && (
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-white/40">إصدار التطبيق</dt>
              <dd className="font-medium text-white/85">{info.appVersion}</dd>
            </div>
            <div>
              <dt className="text-white/40">مسار قاعدة البيانات</dt>
              <dd className="break-all font-medium text-white/85">{info.dbPath}</dd>
            </div>
          </dl>
        )}
      </section>
    </div>
  )
}

function PlaceholderCard({ title, description }: { title: string; description: string }): JSX.Element {
  return (
    <div className="rounded-2xl border border-base-border bg-base-surface p-5 transition-colors duration-200 hover:border-accent/40">
      <h3 className="mb-1 font-tajawal text-sm font-bold text-white">{title}</h3>
      <p className="text-xs leading-relaxed text-white/45">{description}</p>
    </div>
  )
}
