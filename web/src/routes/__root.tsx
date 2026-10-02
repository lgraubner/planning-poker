import { createRootRoute, Outlet, useRouterState } from '@tanstack/react-router';
import clsx from 'clsx';
import type { PropsWithChildren } from 'react';
import { ErrorPage } from '../components/ErrorPage';

export const Route = createRootRoute({
  component: AppLayout,
  notFoundComponent: NotFound,
  errorComponent: RouteError,
});

function AppLayout() {
  const isRoom = useRouterState({
    select: (state) => state.matches.some((match) => match.routeId === '/$code'),
  });
  return (
    <Shell bare={isRoom}>
      <Outlet />
    </Shell>
  );
}

// The server puts the operator's legal pages in the head. None are set by default.
const legalLinks = [
  ['legal-notice', 'Legal notice'],
  ['privacy-policy', 'Privacy policy'],
].flatMap(([name, label]) => {
  const href = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content;
  return href ? [{ href, label }] : [];
});

/** A bare page draws its own header and uses the full width. */
function Shell({ bare = false, children }: PropsWithChildren<{ bare?: boolean }>) {
  return (
    <main
      className={clsx(
        'mx-auto flex min-h-dvh w-full flex-col px-4 pt-4 sm:px-6',
        bare ? 'max-w-none' : 'max-w-7xl',
      )}
    >
      {!bare && <p className="text-base font-bold tracking-wide">Planning Poker</p>}
      {children}
      {/* Pinned only where the widest deck, centred, leaves it room. */}
      {legalLinks.length > 0 && (
        <footer className="mt-auto flex gap-4 pt-6 pb-2 text-xs text-zinc-500 lg:fixed lg:bottom-2 lg:left-4 lg:z-20">
          {legalLinks.map(({ href, label }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="no-underline hover:text-zinc-200"
            >
              {label}
            </a>
          ))}
        </footer>
      )}
    </main>
  );
}

// Any path's first segment matches a room, so this renders inside the bare room layout.
function NotFound() {
  return <ErrorPage title="Page not found" home="Back to home" />;
}

// Replaces the whole layout, so it brings its own.
function RouteError() {
  return (
    <Shell bare>
      <ErrorPage title="Something went wrong" description="Please try again later" failed />
    </Shell>
  );
}
