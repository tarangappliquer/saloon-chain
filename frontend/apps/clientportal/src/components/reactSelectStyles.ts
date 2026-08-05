export interface SelectOption {
  value: string;
  label: string;
}

export function selectClassNames(className?: string) {
  return {
    control: (state: { isDisabled?: boolean }) =>
      `flex items-center ${className ?? ''} ${state.isDisabled ? 'opacity-60 cursor-not-allowed bg-muted' : ''}`,
    placeholder: () => 'px-1 text-muted-foreground',
    singleValue: () => 'px-1 text-foreground',
    input: () => 'px-1 text-foreground',
    menu: () => 'mt-1 rounded-lg border border-border bg-card shadow-lg z-50',
    menuList: () => 'py-1',
    option: (state: { isFocused: boolean; isSelected: boolean }) =>
      `cursor-pointer px-3 py-1.5 text-xs font-medium transition-colors ${state.isSelected
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
