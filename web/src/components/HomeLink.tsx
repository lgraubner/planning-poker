import { Link } from '@tanstack/react-router';

export function HomeLink() {
  return (
    <Link
      to="/"
      className="w-fit text-base font-semibold whitespace-nowrap text-zinc-400 no-underline tracking-wide"
    >
      Planning Poker
    </Link>
  );
}
