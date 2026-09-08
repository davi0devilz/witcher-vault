import type { ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function base(children: ReactNode, props: IconProps): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  )
}

export function HomeIcon(props: IconProps): JSX.Element {
  return base(
    <>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9" />
    </>,
    props
  )
}

export function LibraryIcon(props: IconProps): JSX.Element {
  return base(
    <>
      <rect x="3.5" y="4" width="6" height="16" rx="1.2" />
      <rect x="10.5" y="6.5" width="6" height="13.5" rx="1.2" />
      <path d="M18.5 8.2 20.8 19a1 1 0 0 1-.8 1.2l-2.1.4" />
    </>,
    props
  )
}

export function DiceIcon(props: IconProps): JSX.Element {
  return base(
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <circle cx="8.2" cy="8.2" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.8" cy="8.2" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="8.2" cy="15.8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.8" cy="15.8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </>,
    props
  )
}

export function SettingsIcon(props: IconProps): JSX.Element {
  return base(
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 13.6a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V20a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.04H4a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.56-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H10a1.7 1.7 0 0 0 1.04-1.56V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V10a1.7 1.7 0 0 0 1.56 1.04H20a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1.56Z" />
    </>,
    props
  )
}

export function CompassIcon(props: IconProps): JSX.Element {
  return base(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2.1 5.1-5.1 2.1 2.1-5.1 5.1-2.1Z" />
    </>,
    props
  )
}

export function HeartIcon(props: IconProps): JSX.Element {
  return base(
    <path d="M12 20.2s-7.5-4.6-9.9-9.2C.6 7.7 2 4.4 5.1 3.5c2-.6 4 .2 5.2 2 .3.5.7 1.2 1.7 1.2.9 0 1.3-.6 1.7-1.2 1.2-1.8 3.2-2.6 5.2-2 3.1.9 4.5 4.2 3 7.5-2.4 4.6-9.9 9.2-9.9 9.2Z" />,
    props
  )
}

export function XIcon(props: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

export function DiscordIcon(props: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" {...props}>
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.076.076 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.955 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  )
}
