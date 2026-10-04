import type { PropsWithChildren } from 'react';

export function CenteredSection({ children }: PropsWithChildren) {
  // Sits a little above the middle, where the eye expects the centre to be.
  return (
    <section className="mx-auto flex w-full max-w-sm grow flex-col justify-center pb-[12vh]">
      {children}
    </section>
  );
}
