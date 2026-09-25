import type { ReactNode } from 'react';

export function ErrorMessage({ children }: { children: ReactNode }) {
  return children ? (
    <p role="alert" className="leading-normal text-red-400">
      {children}
    </p>
  ) : null;
}
