import { createRootRoute, Outlet } from '@tanstack/react-router';
import type { PropsWithChildren } from 'react';
import { ErrorPage } from '../components/ErrorPage';

export const Route = createRootRoute({
  component: AppLayout,
  notFoundComponent: NotFound,
  errorComponent: RouteError,
});

function AppLayout() {
  return (
    <Shell>
      <Outlet />
    </Shell>
  );
}

function Shell({ children }: PropsWithChildren) {
  return (
    <main className="flex min-h-dvh w-full flex-col px-4 pt-2 sm:px-6 sm:pt-4">{children}</main>
  );
}

// Any path's first segment matches a room, so this renders inside the room route.
function NotFound() {
  return <ErrorPage title="Page not found" home="Back to home" />;
}

// Replaces the whole layout, so it brings its own.
function RouteError() {
  return (
    <Shell>
      <ErrorPage title="Something went wrong" description="Please try again later" failed />
    </Shell>
  );
}
