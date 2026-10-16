import { createRootRoute, Outlet } from '@tanstack/react-router';
import type { ReactNode } from 'react';
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

interface ShellProps {
  children: ReactNode;
}

function Shell({ children }: ShellProps) {
  return (
    <main className="flex min-h-dvh w-full flex-col px-4 pt-2 sm:px-6 sm:pt-4">{children}</main>
  );
}

function NotFound() {
  return <ErrorPage title="Page not found" home="Back to home" />;
}

function RouteError() {
  return (
    <Shell>
      <ErrorPage title="Something went wrong" description="Please try again later" failed />
    </Shell>
  );
}
