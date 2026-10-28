import { CornerDownRight } from 'lucide-react'
import type { ReactNode } from 'react'

export const GitHubIcon = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="currentColor"><path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.34c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.22 1.88.87 2.34.66.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.58.83-2.14-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.52.56.83 1.27.83 2.14 0 3.07-1.87 3.75-3.66 3.95.29.25.54.74.54 1.5v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 0Z" /></svg>
)

/** The "↪" turn Emotion uses in headlines, links and buttons. Decorative. */
export const Turn = ({ className = '' }: { className?: string }) => (
  <CornerDownRight aria-hidden="true" strokeWidth={1.5} className={`inline-block shrink-0 ${className}`} />
)

/** Glass pill with a moving gradient inside. data-magnetic pulls it toward the pointer. */
export function Pill({ href, children, size = 'md', external = false }: { href: string; children: ReactNode; size?: 'md' | 'sm'; external?: boolean }) {
  return (
    <a
      href={href}
      data-magnetic
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={`pill ${size === 'sm' ? 'pill-sm' : ''}`}
    >
      {children}
      <Turn className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
    </a>
  )
}

export const Tag = ({ children }: { children: ReactNode }) => <span className="tag">{children}</span>
