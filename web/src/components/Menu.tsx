import { Menu as BaseMenu } from '@base-ui/react/menu';
import { clsx } from 'clsx';

function Popup({ className, ...props }: BaseMenu.Popup.Props) {
  return (
    <BaseMenu.Popup
      className={clsx(
        'min-w-44 origin-(--transform-origin) rounded-lg border border-border bg-surface p-1 shadow-lg shadow-black/40 outline-none transition-[opacity,scale] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] data-ending-style:opacity-0 data-starting-style:opacity-0 motion-safe:data-ending-style:scale-95 motion-safe:data-starting-style:scale-95',
        className,
      )}
      {...props}
    />
  );
}

function Item({ className, ...props }: BaseMenu.Item.Props) {
  return (
    <BaseMenu.Item
      className={clsx(
        'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm outline-none data-highlighted:bg-surface-raised [&>svg]:text-zinc-400',
        className,
      )}
      {...props}
    />
  );
}

function LinkItem({ className, ...props }: BaseMenu.LinkItem.Props) {
  return (
    <BaseMenu.LinkItem
      className={clsx(
        'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm no-underline outline-none data-highlighted:bg-surface-raised [&>svg]:text-zinc-400',
        className,
      )}
      {...props}
    />
  );
}

export const Menu = {
  ...BaseMenu,
  Popup,
  Item,
  LinkItem,
};
