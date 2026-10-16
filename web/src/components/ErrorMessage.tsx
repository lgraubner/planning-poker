import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

export function ErrorMessage({ children }: Props) {
  return children ? (
    <p role="alert" className="leading-normal text-red-400">
      {children}
    </p>
  ) : null;
}
