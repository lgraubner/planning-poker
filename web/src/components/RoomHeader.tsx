import { AlertDialog } from '@base-ui/react/alert-dialog';
import { Menu } from '@base-ui/react/menu';
import { useBlocker } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { legalLinks } from '../legal-links';
import { Button } from './Button';
import { HomeLink } from './HomeLink';
import { Icon } from './Icon';
import { CopyLinkButton, useCopyLink } from './CopyLinkButton';
import { InlineEdit } from './InlineEdit';

export function RoomHeader({
  title,
  connected,
  onRename,
  spectators,
}: {
  title: string;
  connected: boolean;
  onRename: (title: string) => void;
  spectators: ReactNode;
}) {
  return (
    // Phones give the title a line of its own beneath the bar, so a long one still fits
    <header className="mb-2 grid min-h-11 grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[1fr_minmax(0,auto)_1fr]">
      <HomeLink />
      <LeaveRoomDialog />
      <h1 className="col-span-full row-start-2 min-w-0 text-center sm:col-span-1 sm:col-start-2 sm:row-start-1 text-lg leading-tight font-semibold tracking-tight">
        {/* Button and field share one box, so the text stays put when editing starts. */}
        <InlineEdit
          value={title}
          label="Room title"
          maxLength={100}
          disabled={!connected}
          onCommit={onRename}
          className="inline-block max-w-full border border-transparent px-[7px] py-1"
          inputClassName="field-sizing-content max-w-full min-w-16 px-[7px] py-1 text-center"
        />
      </h1>
      <div className="col-start-2 row-start-1 flex items-center gap-2 justify-self-end sm:col-start-3">
        {spectators}
        {/* Phones copy from the menu instead, leaving the title room. */}
        <CopyLinkButton
          className="max-sm:hidden"
          buttonClassName="rounded-md border border-indigo-400 px-2.5 text-sm hover:bg-indigo-400/10"
          statusClassName="right-0 text-right"
        />
        <RoomMenu />
      </div>
    </header>
  );
}

const popupClassName =
  'min-w-44 origin-(--transform-origin) rounded-lg border border-border bg-surface p-1 shadow-lg shadow-black/40 outline-none transition-[opacity,scale] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] data-ending-style:opacity-0 data-starting-style:opacity-0 motion-safe:data-ending-style:scale-95 motion-safe:data-starting-style:scale-95';

const repository = 'https://github.com/lgraubner/planning-poker';

const menuLinks = [
  { href: `${repository}/issues/new`, label: 'Report a problem' },
  { href: repository, label: 'Source on GitHub' },
  ...legalLinks,
];

// An icon, where an item has one, leads it muted so the label still reads first
const menuItemClassName =
  'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm outline-none data-highlighted:bg-surface-raised [&>svg]:text-zinc-400';

/** Links that open in a new tab, so following one keeps your seat. */
function RoomMenu() {
  const [result, copy] = useCopyLink();
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Menu"
        className="flex size-8 items-center justify-center rounded-md border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 data-popup-open:border-zinc-500 data-popup-open:text-zinc-200"
      >
        <Icon>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </Icon>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={4} className="z-30">
          <Menu.Popup className={popupClassName}>
            {/* Stays open, so the item can confirm the copy. */}
            <Menu.Item
              closeOnClick={false}
              onClick={copy}
              className={clsx(menuItemClassName, 'font-semibold text-indigo-400 sm:hidden')}
            >
              {result === 'copied'
                ? 'Link copied'
                : result === 'failed'
                  ? 'Copy the link from your address bar'
                  : 'Copy room link'}
            </Menu.Item>
            <span role="status" className="sr-only">
              {result === 'copied' && 'Link copied'}
            </span>
            {menuLinks.map(({ href, label }) => (
              <Menu.LinkItem
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer"
                closeOnClick
                className={clsx(menuItemClassName, 'no-underline')}
              >
                {label}
              </Menu.LinkItem>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** Asks before any way out of the room, the back button included: leaving drops your seat. */
function LeaveRoomDialog() {
  const { status, proceed, reset } = useBlocker({
    shouldBlockFn: ({ current, next }) => current.pathname !== next.pathname,
    // Reloading rejoins at once, so it needs no prompt
    enableBeforeUnload: false,
    withResolver: true,
  });

  return (
    <AlertDialog.Root open={status === 'blocked'} onOpenChange={(open) => !open && reset?.()}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-40 bg-black/60 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <AlertDialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-1/2 rounded-xl border border-border bg-surface p-6 shadow-lg shadow-black/40 outline-none transition-[opacity,scale] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] data-ending-style:opacity-0 data-starting-style:opacity-0 motion-safe:data-ending-style:scale-95 motion-safe:data-starting-style:scale-95">
          <AlertDialog.Title className="text-lg font-semibold">Leave the room?</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-zinc-400">
            The others will no longer see you at the table.
          </AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-3">
            <AlertDialog.Close className="min-h-10 rounded-lg border border-indigo-400 px-3.5 py-2 text-sm font-semibold hover:bg-indigo-400/10">
              Stay
            </AlertDialog.Close>
            <Button onClick={proceed}>Leave room</Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
