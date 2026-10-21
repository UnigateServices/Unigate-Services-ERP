'use client';

import { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'tool' | 'mini' | 'submit' | 'soft' | 'choice';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children?: ReactNode;
};

export function Button({ variant = 'secondary', className, type = 'button', children, ...rest }: Props) {
  const classes = `ui-btn is-${variant}${className ? ` ${className}` : ''}`;
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
