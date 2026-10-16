import { Popover as BasePopover } from '@base-ui/react/popover';
import { clsx } from 'clsx';

function Popup({ className, ...props }: BasePopover.Popup.Props) {
  return (
    <BasePopover.Popup
      className={clsx(
        'min-w-44 origin-(--transform-origin) rounded-lg border border-border bg-surface p-1 shadow-lg shadow-black/40 outline-none transition-[opacity,scale] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] data-ending-style:opacity-0 data-starting-style:opacity-0 motion-safe:data-ending-style:scale-95 motion-safe:data-starting-style:scale-95',
        className,
      )}
      {...props}
    />
  );
}

export const Popover = {
  ...BasePopover,
  Popup,
};
