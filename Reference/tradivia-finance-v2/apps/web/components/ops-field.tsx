'use client';

import { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

type FieldProps = {
  label?: ReactNode;
  children: ReactNode;
  className?: string;
  hint?: ReactNode;
};

export function OpsField({ label, children, className, hint }: FieldProps) {
  return (
    <label className={`ops-field${className ? ` ${className}` : ''}`}>
      {label != null && label !== '' ? <span className="ops-field-label">{label}</span> : null}
      {children}
      {hint ? <span className="ops-field-hint">{hint}</span> : null}
    </label>
  );
}

export function OpsInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={`ops-input form-control${className ? ` ${className}` : ''}`} />;
}

export function OpsTextarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={`ops-input ops-textarea form-control${className ? ` ${className}` : ''}`} />;
}
