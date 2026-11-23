interface Props {
  children: React.ReactNode
  className?: string
}

export function SectionLabel({ children, className = '' }: Props) {
  return (
    <label className={`block font-display text-[14px] font-700 text-text mb-3 ${className}`}>
      {children}
    </label>
  )
}
