import clsx from 'clsx';
import type { ReactNode } from 'react';

// Lucide's 24px line icons, pasted as the children of their <svg>
const icons = {
  armchair: (
    <>
      <path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3" />
      <path d="M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z" />
      <path d="M5 18v2" />
      <path d="M19 18v2" />
    </>
  ),
  // The copy confirmation draws it in, which needs a known path length
  check: <path d="M4 12.5l5 5L20 6.5" pathLength={1} />,
  'chevrons-up-down': <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />,
  eye: (
    <>
      <path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  pencil: (
    <>
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="m15 5 4 4" />
    </>
  ),
  'rotate-ccw': (
    <>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="5" />
      <path d="M20 21a8 8 0 0 0-16 0" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6L6 18" />,
} satisfies Record<string, ReactNode>;

export function Icon({
  name,
  className = 'size-4',
  strokeWidth = 2,
}: {
  name: keyof typeof icons;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      strokeWidth={strokeWidth}
      className={clsx(
        'shrink-0 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round]',
        className,
      )}
    >
      {icons[name]}
    </svg>
  );
}
