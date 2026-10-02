import clsx from 'clsx';
import type { ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  compact?: boolean;
};

/** The button look, for a link that acts as a page's main action. */
export function buttonClassName(compact?: boolean) {
  return clsx(
    'inline-flex items-center justify-center gap-1.5 border border-indigo-400 bg-indigo-400 font-semibold text-zinc-950 not-disabled:hover:border-indigo-300 not-disabled:hover:bg-indigo-300',
    compact ? 'min-h-10 rounded-lg px-3.5 py-2 text-sm' : 'min-h-12 rounded-lg px-6 py-3',
  );
}

export function Button({ compact, ...props }: ButtonProps) {
  return <button {...props} className={buttonClassName(compact)} />;
}
