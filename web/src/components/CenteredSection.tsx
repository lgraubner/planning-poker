import type { PropsWithChildren, ReactNode } from 'react';
import { LegalFooter } from './LegalFooter';

export function CenteredSection({ header, children }: PropsWithChildren<{ header?: ReactNode }>) {
  return (
    <>
      {/* Held open without a header, so every page centres alike. */}
      {header ? (
        <header className="flex min-h-11 items-center">{header}</header>
      ) : (
        <div className="min-h-11" />
      )}
      {/* Sits a little above the middle, where the eye expects the centre to be. */}
      <section className="mx-auto flex w-full max-w-sm grow flex-col justify-center pb-[8vh]">
        {children}
      </section>
      <LegalFooter />
    </>
  );
}
