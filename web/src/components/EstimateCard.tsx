type EstimateCardProps = {
  value: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
};

export function EstimateCard({ value, selected, disabled, onClick }: EstimateCardProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      aria-label={value === '?' ? 'Unsure' : value === '☕' ? 'Coffee break' : value}
      className={`h-18 w-12 shrink-0 rounded-lg border-2 px-1.5 py-1 text-lg font-semibold transition duration-200 ease-out motion-reduce:transition-none ${
        selected
          ? '-translate-y-2 border-indigo-400 bg-indigo-400 text-zinc-950'
          : 'border-border bg-surface text-zinc-200'
      }`}
    >
      {value}
    </button>
  );
}
