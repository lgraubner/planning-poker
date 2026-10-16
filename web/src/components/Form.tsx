import type { FormHTMLAttributes } from 'react';

interface Props extends FormHTMLAttributes<HTMLFormElement> {}

export function Form(props: Props) {
  return <form {...props} className="mt-8 flex flex-col gap-5" />;
}
