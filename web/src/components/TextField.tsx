import type { InputHTMLAttributes } from 'react';

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  id: string;
  label: string;
  error?: string;
};

export function TextField({ id, label, error, ...props }: TextFieldProps) {
  return (
    <>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
        className="min-h-13 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3"
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="-mt-1 text-sm text-red-400">
          {error}
        </p>
      )}
    </>
  );
}
