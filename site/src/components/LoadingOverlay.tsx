import { useEffect, useState } from 'react';

export function LoadingOverlay() {
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    const timer = setInterval(() => setDotCount((c) => (c % 3) + 1), 500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 border-2 border-border rounded-full" />
          <div className="absolute inset-0 border-2 border-transparent border-t-accent rounded-full animate-spin" />
        </div>
        <span className="text-sm text-text-primary font-medium tracking-tight">
          온톨로지를 구성하는 중입니다<span className="inline-block w-[1.2em] text-left">{'.'.repeat(dotCount)}</span>
        </span>
      </div>
    </div>
  );
}
