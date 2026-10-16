---
paths: ['**/*.tsx', '**/*.jsx']
---

# React

## Components

- Keep one main component per file and match the filename to its name, such as `StatusIndicator.tsx` for `StatusIndicator`. Small, one-off supporting components may stay beside it.
- Declare component props in an `interface` directly above the component. Name the main component's interface `Props`; use `<ComponentName>Props` for supporting components.
- Expose intent-specific callbacks such as `onClose` instead of passing React state setters such as `setOpen`.

## Styling

- Share styling through components. A class string stays inside the component that renders it and is never exported; where two places need the same look and no component fits, duplicate the classes.
- Use `clsx` for conditional or merged `className` values.

## Effects

Follow [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect). Use `useEffect` only to keep a component in sync with an outside system for as long as it is mounted, such as a WebSocket, a browser API, or a timer that follows a prop. Everything else has a better place:

- Data a page needs when it opens: the route's loader, with a pending component for the loading state.
- What a click or submit sets off: its event handler.
- Setup on a DOM node: a ref callback that returns its cleanup, defined outside the component so a re-render does not call it again.
- State that resets when a prop changes: a `key` on the component.
- A value derived from props or state: compute it during render.

## Project specifics

- Data a page needs when it opens: the route's `loader` with `fetch`, parsed with the zod schemas in `web/src/api.ts`, and `pendingComponent` for the loading state. Live room state comes only from `useRoom`. Do not add a data-fetching library.
- Use [TanStack Form](https://tanstack.com/form/latest/docs/overview) for forms, as in `JoinRoom.tsx`.
- There are no accounts: the room link is the only key, and a display name does not establish identity.

### Base UI wrappers

Check the existing components before adding an interactive one. Build new ones from a [Base UI](https://base-ui.com/llms.txt) primitive. A wrapper re-exports all parts of the primitive and replaces only the parts that need project styling:

```tsx
import { Popover as BasePopover } from '@base-ui/react/popover';
import { clsx } from 'clsx';

function Popup({ className, ...props }: BasePopover.Popup.Props) {
  return (
    <BasePopover.Popup
      className={clsx('rounded-lg border border-border bg-surface p-1 shadow-lg', className)}
      {...props}
    />
  );
}

export const Popover = {
  ...BasePopover,
  Popup,
};
```

### Dialogs

A dialog-like component with a single trigger (Popover, Dialog, AlertDialog) takes the trigger as `children` and owns its open state. Put its form in a child component that mounts with the dialog content: closing the dialog unmounts the child and resets it, so nothing resets it by hand. Name the child `<ActionName>Form`, even for an action without a form.

A popup whose trigger shows the component's own state, such as the spectator count in `SpectatorList`, renders that trigger itself instead of taking it as `children`.

```tsx
<RenameRoomDialog>
  <Button>Rename</Button>
</RenameRoomDialog>
```

```tsx
interface Props {
  children: React.ReactElement;
}

function RenameRoomDialog({ children }: Props) {
  return (
    <Dialog.Root>
      <Dialog.Trigger render={children} />
      <Dialog.Portal>
        <Dialog.Popup>
          <RenameRoomForm />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RenameRoomForm() {
  const form = useForm({
    onSubmit: ({ value }) => rename(value.title),
  });
  // ...
}
```

A dialog opened by something other than a trigger, such as `LeaveRoomDialog` in `RoomHeader.tsx` (opened by the router's blocker), controls `open` itself.
