'use client';

import { useRef, useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { IconCheck, IconSelector } from '@tabler/icons-react';

interface HowMetInputProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export function HowMetInput({ value, onChange, suggestions, inputRef }: HowMetInputProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);

  const filtered = suggestions.filter((s) =>
    s.toLowerCase().includes((search || value).toLowerCase())
  );

  return (
    <div className='space-y-1'>
      <label className='text-sm font-medium'>Known From</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={triggerRef}
            variant='outline'
            role='combobox'
            aria-expanded={open}
            className='w-full justify-between font-normal'
          >
            <span className={cn(!value && 'text-muted-foreground')}>
              {value || 'Type or select...'}
            </span>
            <IconSelector className='ml-2 h-4 w-4 shrink-0 opacity-50' />
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-[var(--radix-popover-trigger-width)] p-0' align='start'>
          <Command shouldFilter={false}>
            <CommandInput
              ref={inputRef}
              placeholder='Search or type new...'
              value={search || value}
              onValueChange={(v) => {
                setSearch(v);
                onChange(v);
              }}
            />
            <CommandList>
              <CommandEmpty>
                {value ? (
                  <span className='text-muted-foreground text-sm'>
                    Will use &quot;{value}&quot;
                  </span>
                ) : (
                  'Type a value...'
                )}
              </CommandEmpty>
              <CommandGroup>
                {filtered.slice(0, 10).map((suggestion) => (
                  <CommandItem
                    key={suggestion}
                    value={suggestion}
                    onSelect={() => {
                      onChange(suggestion);
                      setSearch('');
                      setOpen(false);
                      triggerRef.current?.focus();
                    }}
                  >
                    <IconCheck
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === suggestion ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    {suggestion}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
