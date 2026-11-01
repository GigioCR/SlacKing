// Small line icons, drawn in currentColor so they follow the text colour in both themes.

type IconProps = { size?: number; className?: string }

function Svg({ size = 20, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  )
}

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
)

export const AskIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.2 9a3 3 0 1 1 4.3 2.7c-.9.4-1.5 1.2-1.5 2.2V15" />
    <path d="M12 18.5h.01" />
  </Svg>
)

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
)

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </Svg>
)

export const BackIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
)

export const NextIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 5l7 7-7 7" />
  </Svg>
)

export const InboxIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 13l2.5-7h11L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5z" />
    <path d="M4 13h4.5l1.5 2.5h4l1.5-2.5H20" />
  </Svg>
)

export const PhoneIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
    <path d="M11 18.5h2" />
  </Svg>
)

export const BellOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 19a2.5 2.5 0 0 0 5 0M18 13.5V10a6 6 0 0 0-9.3-5M6.4 6.4A6 6 0 0 0 6 10v3.5L4 17h13M3 3l18 18" />
  </Svg>
)

export const CopyIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </Svg>
)

export const FingerprintIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4.5A9 9 0 0 1 21 12v1" />
    <path d="M3 12a9 9 0 0 1 1.5-5" />
    <path d="M7 12a5 5 0 0 1 10 0v1.5a10 10 0 0 1-1 4.5" />
    <path d="M12 12v2a14 14 0 0 1-2 7" />
    <path d="M3.5 16a14 14 0 0 0 .5-4" />
    <path d="M7.5 20.5A10 10 0 0 0 9 14v-2a3 3 0 0 1 3-3" />
    <path d="M19.5 16.5a18 18 0 0 1-1 4" />
  </Svg>
)

export const KeyIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="15" r="4" />
    <path d="M10.8 12.2L20 3M16 7l3 3M14 9l2 2" />
  </Svg>
)

export const RetryIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
  </Svg>
)
