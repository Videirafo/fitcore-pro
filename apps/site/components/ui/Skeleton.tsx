import type { HTMLAttributes } from 'react';

export type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  variant?: 'default' | 'circle' | 'rounded' | 'square';
  animation?: 'pulse' | 'none';
};

const variantClass: Record<NonNullable<SkeletonProps['variant']>, string> = {
  default: 'rounded-lg',
  circle: 'rounded-full',
  rounded: 'rounded-2xl',
  square: 'rounded-none',
};

/**
 * FitCore-owned adaptation of Lightswind's MIT `skeleton` registry primitive.
 * Source: codewithMUHILAN/Lightswind-UI-Library @ 53ef2ee.
 */
export function Skeleton({
  className = '',
  variant = 'default',
  animation = 'pulse',
  ...props
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={[
        'bg-white/10',
        variantClass[variant],
        animation === 'pulse' ? 'animate-pulse motion-reduce:animate-none' : '',
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    />
  );
}
