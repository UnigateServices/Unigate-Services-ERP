'use client';

import { ButtonHTMLAttributes, ReactNode } from 'react';

export type OpsButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'tool' | 'mini' | 'submit' | 'soft' | 'choice';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: OpsButtonVariant;
  children?: ReactNode;
};

export function OpsButton({ variant = 'secondary', className, type = 'button', children, ...rest }: Props) {
  const classes = `ops-btn is-${variant}${className ? ` ${className}` : ''}`;
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
