import { ReactNode } from 'react';
import { Input } from './field';

type ToolbarProps = {
  search?: string;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  actions?: ReactNode;
};

export function PageToolbar({ search, onSearch, searchPlaceholder = 'بحث', filters, actions }: ToolbarProps) {
  return (
    <div className="ui-ptb">
      {onSearch ? (
        <Input className="ui-ptb-search" value={search ?? ''} placeholder={searchPlaceholder} onChange={(event) => onSearch(event.target.value)} />
      ) : null}
      {filters}
      {actions ? <div className="ui-ptb-end">{actions}</div> : null}
    </div>
  );
}

export function FilterPills<T extends string>({ value, options, onChange }: { value: T; options: readonly (readonly [T, string])[]; onChange: (value: T) => void }) {
  return (
    <div className="ui-pills">
      {options.map(([id, label]) => (
        <button key={id} type="button" className={value === id ? 'is-on' : ''} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}