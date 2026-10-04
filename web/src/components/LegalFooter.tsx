import { legalLinks } from '../legal-links';

/** The legal pages, for every page but the room, whose menu holds them. */
export function LegalFooter() {
  if (legalLinks.length === 0) return null;
  return (
    <footer className="mt-auto flex justify-center gap-4 pt-6 pb-4 text-sm text-zinc-500">
      {legalLinks.map(({ href, label }) => (
        <a key={label} href={href} target="_blank" rel="noreferrer" className="no-underline">
          {label}
        </a>
      ))}
    </footer>
  );
}
