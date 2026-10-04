import { Link } from '@tanstack/react-router';
import clsx from 'clsx';
import { buttonClassName } from './Button';
import { HomeLink } from './HomeLink';
import { LegalFooter } from './LegalFooter';

const homeClassName = clsx(
  buttonClassName,
  'mt-6 no-underline transition-[scale] duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none',
);

// Headings and the line under them read without a closing full stop.
const bare = (text: string) => text.replace(/\.$/, '');

/** A dead end: what went wrong, centred under a tilted card, and maybe a way on. */
export function ErrorPage({
  title,
  description,
  home,
  failed,
}: {
  title: string;
  description?: string;
  /** Label of a link home, where it is the obvious next step. */
  home?: string;
  /** Something broke, rather than something is missing: the card shows a cross. */
  failed?: boolean;
}) {
  return (
    <>
      <header className="flex min-h-11 items-center">
        <HomeLink />
      </header>
      {/* Sits a little above the middle, where the eye expects the centre to be. */}
      <section className="flex grow flex-col items-center justify-center pb-[12vh] text-center">
        <div
          aria-hidden="true"
          className="mb-8 flex h-21 w-14 -rotate-6 items-center justify-center rounded-xl border-2 border-border bg-surface text-2xl font-semibold text-zinc-500"
        >
          {failed ? (
            // Drawn, as a typed × sits small and thin beside the question mark.
            <svg
              viewBox="0 0 24 24"
              className="size-5 fill-none stroke-current stroke-3 [stroke-linecap:round]"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            '?'
          )}
        </div>
        <h1 className="max-w-md text-3xl font-semibold tracking-tight text-balance wrap-anywhere">
          {bare(title)}
        </h1>
        {description && (
          <p className="mt-3 max-w-md leading-relaxed text-balance text-zinc-400">
            {bare(description)}
          </p>
        )}
        {home && (
          <Link to="/" className={homeClassName}>
            {home}
          </Link>
        )}
      </section>
      <LegalFooter />
    </>
  );
}
