import type { FormHTMLAttributes } from 'react';

export function Form(props: FormHTMLAttributes<HTMLFormElement>) {
  return <form {...props} className="mt-8 flex flex-col gap-3" />;
}
