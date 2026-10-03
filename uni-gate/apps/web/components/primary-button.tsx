import type { ReactNode } from 'react';

type PrimaryButtonProps = {
  children: ReactNode;
  disabled?: boolean;
  type?: 'submit' | 'button';
  onClick?: () => void;
};

export function PrimaryButton({ children, disabled, type = 'submit', onClick }: PrimaryButtonProps) {
  return (
    <button type={type} className="primary-button" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
