import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  const baseStyle =
    'inline-flex items-center justify-center font-medium transition-all duration-150 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50';

  const sizeStyles = {
    sm: 'rounded-md px-3 py-1.5 text-xs gap-1.5',
    md: 'rounded-lg px-4 py-2 text-sm gap-2',
    lg: 'rounded-xl px-5 py-2.5 text-base gap-2.5',
  };

  const variantStyles = {
    primary: 'bg-purple-600 text-white hover:bg-purple-700 hover:shadow-purple-600/25 hover:shadow-md dark:bg-purple-600 dark:hover:bg-purple-500',
    secondary: 'bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700',
    outline: 'border border-gray-300 bg-transparent text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900',
    danger: 'bg-red-600 text-white hover:bg-red-700 hover:shadow-red-600/25 hover:shadow-md',
  };

  return (
    <button type={type} className={`${baseStyle} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
