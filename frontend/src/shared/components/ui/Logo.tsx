// Logo — centralized brand logo image. Replace raw <img src="/logo.png"> usages.
interface LogoProps {
  className?: string
  alt?: string
}

export function Logo({ className = 'w-10 h-10 rounded-lg object-contain', alt = 'Kidversa Logo' }: LogoProps) {
  return <img src="/logo.png" alt={alt} className={className} />
}
