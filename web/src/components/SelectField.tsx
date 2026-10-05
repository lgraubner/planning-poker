import { Select } from '@base-ui/react/select';

type SelectFieldProps = {
  label: string;
  // A description shows under its label in the list, not in the closed field
  items: { value: string; label: string; description?: string }[];
  value: string;
  onValueChange: (value: string) => void;
};

export function SelectField({ label, items, value, onValueChange }: SelectFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Select.Root
        items={items}
        value={value}
        onValueChange={(next) => next !== null && onValueChange(next)}
      >
        <Select.Label className="text-sm font-semibold">{label}</Select.Label>
        <Select.Trigger className="flex min-h-10 w-full items-center justify-between gap-3 rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-1.5 text-left hover:border-zinc-500 active:scale-none">
          <Select.Value />
          <Select.Icon className="text-zinc-400">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-4 fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round]"
            >
              <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
            </svg>
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          {/* Overlapping the trigger needs an inline <style>, which the CSP blocks. */}
          <Select.Positioner alignItemWithTrigger={false} sideOffset={4} className="z-10">
            <Select.Popup className="w-(--anchor-width) origin-(--transform-origin) rounded-lg border border-border bg-surface p-1 shadow-lg shadow-black/40 outline-none transition-[opacity,scale] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] data-ending-style:opacity-0 data-starting-style:opacity-0 motion-safe:data-ending-style:scale-95 motion-safe:data-starting-style:scale-95">
              <Select.List>
                {items.map((item) => (
                  <Select.Item
                    key={item.value}
                    value={item.value}
                    className="flex cursor-default items-center justify-between gap-3 rounded-md px-3 py-2.5 outline-none select-none data-highlighted:bg-surface-raised"
                  >
                    <span className="flex flex-col">
                      <Select.ItemText>{item.label}</Select.ItemText>
                      {item.description && (
                        <span className="text-sm text-zinc-400">{item.description}</span>
                      )}
                    </span>
                    <Select.ItemIndicator className="text-indigo-400">
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="size-4 fill-none stroke-current stroke-[2.5] [stroke-linecap:round] [stroke-linejoin:round]"
                      >
                        <path d="M4 12.5l5 5L20 6.5" />
                      </svg>
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
