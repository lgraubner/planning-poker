import type { ReactNode } from 'react';

export function PageIntro({
  eyebrow,
  title,
  description,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  description: ReactNode;
}) {
  return (
    <>
      <p className="text-xs font-bold tracking-widest text-indigo-400 uppercase">{eyebrow}</p>
      <h1 className="mt-4 mb-6 text-4xl font-semibold tracking-tighter wrap-anywhere sm:text-5xl">
        {title}
      </h1>
      <p className="leading-relaxed text-zinc-400">{description}</p>
    </>
  );
}
