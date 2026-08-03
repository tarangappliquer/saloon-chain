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

// Thin react-select wrapper -- gets us real select2 parity (type-to-filter, multi-select with
// removable chips, clear button, full keyboard nav/ARIA) for free instead of hand-rolling and
// re-debugging that behavior ourselves. `unstyled` strips react-select's default CSS; `control`
// takes the exact className each call site used to put on its native <select> (so the box itself
// looks unchanged -- bordered box here, dashed pill there); the rest (menu/options/chips) are new
// elements with no prior style to match, so they get one sane default look.
function classNames(className: string | undefined) {
  return {
    control: () => `flex items-center ${className ?? ''}`,
    placeholder: () => 'px-1 text-gray-400',
    singleValue: () => 'px-1',
    input: () => 'px-1 text-inherit',
    menu: () => 'mt-1 rounded-lg border border-gray-300 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900',
    menuList: () => 'py-1',
    option: (state: { isFocused: boolean; isSelected: boolean }) =>
      `cursor-pointer px-3 py-1.5 text-sm ${
        state.isSelected
          ? 'bg-purple-600 text-white'
          : state.isFocused
            ? 'bg-gray-100 dark:bg-gray-800'
            : 'text-gray-900 dark:text-gray-100'
      }`,
    multiValue: () => 'm-0.5 flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs dark:bg-gray-800',
    multiValueLabel: () => 'px-0.5',
    multiValueRemove: () => 'cursor-pointer px-0.5 text-gray-400 hover:text-red-500',
    clearIndicator: () => 'cursor-pointer px-1 text-gray-400 hover:text-red-500',
    dropdownIndicator: () => 'px-1 text-gray-400',
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
