import { useRef, useState } from 'react';
import clsx from 'clsx';
import { Icon } from './Icon';

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
            <Icon
              name="check"
              strokeWidth={2.5}
              className={clsx(
                'size-4 [&>path]:[stroke-dasharray:1] [&>path]:transition-[stroke-dashoffset] motion-reduce:[&>path]:transition-none',
                copied
                  ? '[&>path]:delay-75 [&>path]:duration-300 [&>path]:ease-[cubic-bezier(0.23,1,0.32,1)] [&>path]:[stroke-dashoffset:0]'
                  : '[&>path]:[stroke-dashoffset:1]',
              )}
            />
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

export function useCopyLink() {
  const [result, setResult] = useState<'copied' | 'failed' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  async function copy() {
    try {
      await navigator.clipboard.writeText(location.href);
      setResult('copied');
    } catch {
      setResult('failed');
    }

    clearTimeout(timer.current);
    timer.current = setTimeout(() => setResult(null), 3000);
  }

  return [result, copy] as const;
}
