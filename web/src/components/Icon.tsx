import type { ReactNode } from 'react';

/** A 16px line icon in the text's colour, from Lucide's 24px grid. */
export function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4 shrink-0 fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round]"
    >
      {children}
    </svg>
  );
}
