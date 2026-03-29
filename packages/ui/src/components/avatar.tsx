import { cn } from '../lib/utils';

export interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  xs: 'h-5 w-5 text-[10px]',
  sm: 'h-6 w-6 text-xs',
  md: 'h-8 w-8 text-sm',
  lg: 'h-10 w-10 text-base',
};

export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return src ? (
    <img
      src={src}
      alt={name}
      className={cn('rounded-full object-cover', sizeClasses[size], className)}
    />
  ) : (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-brand-100 font-medium text-brand-700',
        sizeClasses[size],
        className,
      )}
    >
      {initials}
    </span>
  );
}
