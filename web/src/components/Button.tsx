import type { ButtonHTMLAttributes } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {}

export function Button(props: Props) {
  return (
    <button
      {...props}
      className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-indigo-400 bg-indigo-400 px-3.5 py-2 text-sm font-semibold text-zinc-950 not-disabled:hover:border-indigo-300 not-disabled:hover:bg-indigo-300"
    />
  );
}
