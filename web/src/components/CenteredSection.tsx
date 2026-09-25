import type { PropsWithChildren } from 'react';

export function CenteredSection({ children }: PropsWithChildren) {
  return <section className="mx-auto w-full max-w-xl pt-12 sm:pt-24 lg:pt-32">{children}</section>;
}
