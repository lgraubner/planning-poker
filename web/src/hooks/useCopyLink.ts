import { useRef, useState } from 'react';

export function useCopyLink() {
  const [result, setResult] = useState<'copied' | 'failed' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  async function copy() {
    try {
      await navigator.clipboard.writeText(location.href);
      setResult('copied');
    } catch {
      setResult('failed');
    }

    clearTimeout(timer.current);
    timer.current = setTimeout(() => setResult(null), 3000);
  }

  return [result, copy] as const;
}
