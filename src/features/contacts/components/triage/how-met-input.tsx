'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';

export interface HowMetSuggestion {
  value: string;
  count: number;
}

interface HowMetInputProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: HowMetSuggestion[];
  onTab?: () => void;
}

export interface HowMetInputHandle {
  focus: () => void;
}

export const HowMetInput = forwardRef<HowMetInputHandle, HowMetInputProps>(
  function HowMetInput({ value, onChange, suggestions, onTab }, ref) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(-1);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus()
    }));

    const filtered = useMemo(() => {
      if (!value) return suggestions;
      const q = value.toLowerCase();
      const prefix: HowMetSuggestion[] = [];
      const contains: HowMetSuggestion[] = [];
      for (const s of suggestions) {
        const lower = s.value.toLowerCase();
        if (lower.startsWith(q)) prefix.push(s);
        else if (lower.includes(q)) contains.push(s);
      }
      // Both groups sorted by count desc (already sorted from server, but re-sort to be safe)
      prefix.sort((a, b) => b.count - a.count);
      contains.sort((a, b) => b.count - a.count);
      return [...prefix, ...contains];
    }, [value, suggestions]);

    const acceptSuggestion = useCallback(
      (suggestion: string) => {
        onChange(suggestion);
        setShowSuggestions(false);
        setHighlightIndex(-1);
      },
      [onChange]
    );

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          if (showSuggestions && highlightIndex >= 0 && filtered[highlightIndex]) {
            acceptSuggestion(filtered[highlightIndex].value);
          }
          setShowSuggestions(false);
          onTab?.();
          return;
        }

        if (e.key === 'Enter') {
          e.preventDefault();
          if (showSuggestions && highlightIndex >= 0 && filtered[highlightIndex]) {
            acceptSuggestion(filtered[highlightIndex].value);
          } else {
            setShowSuggestions(false);
            onTab?.();
          }
          return;
        }

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (!showSuggestions) {
            setShowSuggestions(true);
            setHighlightIndex(0);
          } else {
            setHighlightIndex((prev) => Math.min(prev + 1, filtered.length - 1));
          }
          return;
        }

        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setHighlightIndex((prev) => Math.max(prev - 1, 0));
          return;
        }

        if (e.key === 'Escape') {
          if (showSuggestions) {
            e.preventDefault();
            e.stopPropagation();
            setShowSuggestions(false);
            setHighlightIndex(-1);
          }
          return;
        }
      },
      [showSuggestions, highlightIndex, filtered, acceptSuggestion, onTab]
    );

    // Auto-highlight first match when typing
    useEffect(() => {
      if (value && filtered.length > 0) {
        setHighlightIndex(0);
      } else {
        setHighlightIndex(-1);
      }
    }, [value, filtered.length]);

    return (
      <div className='space-y-1'>
        <label className='text-sm font-medium'>Known From</label>
        <div className='relative'>
          <input
            ref={inputRef}
            type='text'
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => {
              // Delay to allow click on suggestion
              setTimeout(() => setShowSuggestions(false), 150);
            }}
            onKeyDown={handleKeyDown}
            placeholder='Type or select...'
            className='border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'
          />
          {showSuggestions && filtered.length > 0 && (
            <ul className='bg-popover text-popover-foreground absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border shadow-md'>
              {filtered.slice(0, 10).map((s, i) => (
                <li
                  key={s.value}
                  className={`cursor-pointer px-3 py-1.5 text-sm ${
                    i === highlightIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    acceptSuggestion(s.value);
                  }}
                  onMouseEnter={() => setHighlightIndex(i)}
                >
                  {s.value}
                  <span className='text-muted-foreground ml-2 text-xs'>({s.count})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }
);
