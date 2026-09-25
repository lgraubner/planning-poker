import type { InputHTMLAttributes } from 'react';

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  id: string;
  label: string;
};

export function TextField({ id, label, ...props }: TextFieldProps) {
  return (
    <>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        {...props}
        className="min-h-13 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3"
      />
    </>
  );
}
