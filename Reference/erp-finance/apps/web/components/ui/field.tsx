'use client';

import { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

type FieldProps = {
  label?: ReactNode;
  children: ReactNode;
  className?: string;
  hint?: ReactNode;
};

export function Field({ label, children, className, hint }: FieldProps) {
  return (
    <label className={`ui-field${className ? ` ${className}` : ''}`}>
      {label != null && label !== '' ? <span className="ui-field-label">{label}</span> : null}
      {children}
      {hint ? <span className="ui-field-hint">{hint}</span> : null}
    </label>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={`ui-input form-control${className ? ` ${className}` : ''}`} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={`ui-input ui-textarea form-control${className ? ` ${className}` : ''}`} />;
}
