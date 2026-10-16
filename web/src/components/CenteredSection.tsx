import type { PropsWithChildren, ReactNode } from 'react';
import { LegalFooter } from './LegalFooter';

interface Props extends PropsWithChildren {
  header?: ReactNode;
}

export function CenteredSection({ header, children }: Props) {
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
