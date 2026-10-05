import { useEffect, useState } from 'react';
import clsx from 'clsx';

export function CopyLinkButton({
  className = '',
  buttonClassName = '',
  statusClassName,
}: {
  className?: string;
  buttonClassName?: string;
  statusClassName: string;
}) {
  const [result, copy] = useCopyLink();
  const copied = result === 'copied';

  return (
    <div className={clsx('relative whitespace-nowrap', className)}>
      <button
        type="button"
        onClick={copy}
        className={clsx(
          'min-h-8 font-semibold text-indigo-400 hover:text-indigo-300',
          buttonClassName,
        )}
      >
        {/* Both labels share one cell, so the button keeps the wider one's width. */}
        <span className="grid justify-items-center">
          <span
            className={clsx(
              'col-start-1 row-start-1 transition-[opacity,filter,scale,visibility] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
              copied && 'invisible opacity-0 blur-xs motion-safe:scale-95',
            )}
          >
            Copy room link
          </span>
          <span
            className={clsx(
              'col-start-1 row-start-1 transition-[opacity,filter,scale,visibility] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] inline-flex items-center gap-1',
              !copied && 'invisible opacity-0 blur-xs motion-safe:scale-95',
            )}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-4 fill-none stroke-current stroke-[2.5] [stroke-linecap:round] [stroke-linejoin:round]"
            >
              {/* Draws itself in once the label has faded in. */}
              <path
                d="M4 12.5l5 5L20 6.5"
                pathLength={1}
                className={clsx(
                  '[stroke-dasharray:1] transition-[stroke-dashoffset] motion-reduce:transition-none',
                  copied
                    ? 'delay-75 duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] [stroke-dashoffset:0]'
                    : '[stroke-dashoffset:1]',
                )}
              />
            </svg>
            Link copied
          </span>
        </span>
      </button>
      <span
        role="status"
        className={clsx(
          'absolute top-full mt-1 w-max max-w-60 text-sm text-zinc-400',
          statusClassName,
          copied && 'sr-only',
        )}
      >
        {copied && 'Link copied'}
        {result === 'failed' && 'Copy the link from your address bar.'}
      </span>
    </div>
  );
}

/** Copies the room's link; the result shows for three seconds. */
export function useCopyLink() {
  const [result, setResult] = useState<'copied' | 'failed' | null>(null);

  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => setResult(null), 3000);
    return () => clearTimeout(timer);
  }, [result]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(location.href);
      setResult('copied');
    } catch {
      setResult('failed');
    }
  }

  return [result, copy] as const;
}
