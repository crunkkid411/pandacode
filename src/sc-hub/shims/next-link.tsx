import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { navigate } from './next-navigation';

export default function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean }) {
  const go = (e: MouseEvent<HTMLAnchorElement>) => { onClick?.(e); if (!e.defaultPrevented && href.startsWith('/')) { e.preventDefault(); navigate(href); } };
  return <a href={href.startsWith('/') ? `#${href}` : href} onClick={go} {...rest} />;
}
