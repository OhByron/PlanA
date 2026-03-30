import { cn } from '@projecta/ui';

interface TestStatusBadgeProps {
  status: string; // "pass", "fail", "error", "none"
  total?: number | undefined;
  pass?: number | undefined;
  className?: string | undefined;
}

export function TestStatusBadge({ status, total, pass, className }: TestStatusBadgeProps) {
  if (status === 'none' || !total) return null;

  const colors: Record<string, string> = {
    pass: 'bg-green-100 text-green-700',
    fail: 'bg-red-100 text-red-700',
    error: 'bg-red-100 text-red-700',
  };

  const icons: Record<string, string> = {
    pass: '\u2713',
    fail: '\u2717',
    error: '!',
  };

  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
      colors[status] ?? 'bg-gray-100 text-gray-600',
      className,
    )}>
      {icons[status] ?? '?'} {pass}/{total}
    </span>
  );
}
