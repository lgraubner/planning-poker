import { createRootRoute, Link, Outlet, useRouterState } from '@tanstack/react-router';

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
    <main
      className={`mx-auto flex min-h-dvh flex-col px-4 pt-4 sm:px-6 ${isRoom ? 'max-w-none' : 'max-w-7xl'}`}
    >
      {!isRoom && <p className="text-base font-bold tracking-wide">Planning Poker</p>}
      <Outlet />
    </main>
  );
}

function NotFound() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link to="/">Back home</Link>
    </>
  );
}

function RouteError() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <a href="/">Back home</a>
    </>
  );
}
