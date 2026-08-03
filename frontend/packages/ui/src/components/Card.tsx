import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  hoverable?: boolean;
}

export function Card({ children, hoverable = false, className = '', ...props }: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-gray-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-sm dark:border-gray-800/80 dark:bg-gray-900/90 ${
        hoverable ? 'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-gray-300 dark:hover:border-gray-700' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
