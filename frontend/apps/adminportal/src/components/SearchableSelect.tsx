import Select, { type MultiValue, type SingleValue } from 'react-select';

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface BaseProps {
  options: SearchableSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

interface SingleProps extends BaseProps {
  multiple?: false;
  value: string;
  onChange: (value: string) => void;
}

interface MultiProps extends BaseProps {
  multiple: true;
  value: string[];
  onChange: (value: string[]) => void;
}

type Props = SingleProps | MultiProps;

function classNames(className: string | undefined) {
  return {
    control: (state: { isDisabled?: boolean }) =>
      `flex items-center ${className ?? ''} ${
        state.isDisabled ? 'opacity-60 cursor-not-allowed bg-muted' : ''
      }`,
    placeholder: () => 'px-1 text-muted-foreground',
    singleValue: () => 'px-1 text-foreground',
    input: () => 'px-1 text-foreground',
    menu: () => 'mt-1 rounded-lg border border-border bg-card shadow-lg z-50',
    menuList: () => 'py-1',
    option: (state: { isFocused: boolean; isSelected: boolean }) =>
      `cursor-pointer px-3 py-1.5 text-xs font-medium transition-colors ${
        state.isSelected
          ? 'bg-primary text-primary-foreground'
          : state.isFocused
            ? 'bg-accent text-accent-foreground'
            : 'text-foreground'
      }`,
    multiValue: () => 'm-0.5 flex items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-xs text-accent-foreground',
    multiValueLabel: () => 'px-0.5',
    multiValueRemove: () => 'cursor-pointer px-0.5 text-muted-foreground hover:text-destructive',
    clearIndicator: () => 'cursor-pointer px-1 text-muted-foreground hover:text-destructive',
    dropdownIndicator: () => 'px-1 text-muted-foreground',
    indicatorSeparator: () => 'hidden',
  };
}

export function SearchableSelect(props: Props) {
  if (props.multiple) {
    return <MultiSearchableSelect {...props} />;
  }
  return <SingleSearchableSelect {...(props as SingleProps)} />;
}

function MultiSearchableSelect({
  options,
  placeholder,
  disabled,
  className,
  value,
  onChange,
}: MultiProps) {
  const selectedValues = (value ?? []).map(String);
  const selected = options.filter((o) => selectedValues.includes(String(o.value)));
  return (
    <Select
      isMulti
      isClearable
      isDisabled={disabled}
      placeholder={placeholder}
      options={options}
      value={selected}
      onChange={(picked: MultiValue<SearchableSelectOption>) => onChange(picked.map((o) => o.value))}
      unstyled
      classNames={classNames(className)}
    />
  );
}

function SingleSearchableSelect({
  options,
  placeholder,
  disabled,
  className,
  value,
  onChange,
}: SingleProps) {
  const targetValue = String(value ?? '');
  const selected = options.find((o) => String(o.value) === targetValue) ?? null;
  return (
    <Select
      isClearable
      isDisabled={disabled}
      placeholder={placeholder}
      options={options}
      value={selected}
      onChange={(picked: SingleValue<SearchableSelectOption>) => onChange(picked?.value ?? '')}
      unstyled
      classNames={classNames(className)}
    />
  );
}
