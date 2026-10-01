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
