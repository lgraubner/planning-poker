import type { ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  compact?: boolean;
};

export function Button({ compact, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`border border-indigo-400 font-semibold ${
        compact ? 'min-h-10 rounded-lg px-3.5 py-2 text-sm' : 'min-h-12 rounded-lg px-6 py-3'
      } bg-indigo-400 text-zinc-950`}
    />
  );
}
