import type { PropsWithChildren, ReactNode } from 'react';
import { LegalFooter } from './LegalFooter';

export function CenteredSection({ header, children }: PropsWithChildren<{ header?: ReactNode }>) {
  return (
    <>
      {header ? (
        <header className="flex min-h-11 items-center">{header}</header>
      ) : (
        <div className="min-h-11" />
      )}
      <section className="mx-auto flex w-full max-w-sm grow flex-col justify-center pb-[8vh]">
        {children}
      </section>
      <LegalFooter />
    </>
  );
}
