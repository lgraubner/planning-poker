import { useState } from 'react';
import clsx from 'clsx';
import { Icon } from './Icon';

// Text that turns into a field when clicked, for a value anyone may change at any time
export function InlineEdit({
  value,
  label,
  maxLength,
  disabled,
  onCommit,
  className,
  inputClassName,
}: {
  value: string;
  label: string;
  maxLength: number;
  disabled: boolean;
  onCommit: (value: string) => void;
  className: string;
  inputClassName: string;
}) {
  // Only an open editor holds a draft, so changes by others show until you click
  const [draft, setDraft] = useState<string | null>(null);
  // Shows a sent change until the server's value moves off the one it replaced.
  // ponytail: a change lost to a dropped socket shows until the value next changes.
  const [pending, setPending] = useState<{ from: string; to: string } | null>(null);
  const shown = pending?.from === value ? pending.to : value;

  function commit() {
    const next = draft?.trim();
    if (next && next !== shown && !/\p{Cc}/u.test(next)) {
      onCommit(next);
      setPending({ from: value, to: next });
    }

    setDraft(null);
  }

  return draft === null ? (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setDraft(shown)}
      className={clsx('group active:scale-none', className)}
    >
      <span className="relative block">
        <span className="block truncate">{shown}</span>
        <span
          aria-hidden="true"
          className="absolute top-0 left-full ml-[0.3em] text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <Icon name="pencil" className="inline size-[0.85em] align-[-0.075em]" />
        </span>
      </span>
    </button>
  ) : (
    <input
      aria-label={label}
      autoComplete="off"
      autoFocus
      enterKeyHint="done"
      value={draft}
      maxLength={maxLength}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        }

        if (event.key === 'Escape') {
          setDraft(null);
        }
      }}
      className={clsx(
        'rounded-md border border-zinc-700 bg-zinc-900 outline-none focus:border-indigo-400',
        inputClassName,
      )}
    />
  );
}
