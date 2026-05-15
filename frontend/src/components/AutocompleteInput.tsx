import { useRef, useEffect } from 'react';

export interface AutocompleteResult {
  symbol: string;
  name: string;
}

interface AutocompleteInputProps {
  value: string;
  onChange: (v: string) => void;
  onSelect: (result: AutocompleteResult) => void;
  results: AutocompleteResult[];
  loading?: boolean;
  open: boolean;
  onOpen: (open: boolean) => void;
  placeholder?: string;
  inputClassName?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export default function AutocompleteInput({
  value,
  onChange,
  onSelect,
  results,
  loading = false,
  open,
  onOpen,
  placeholder = 'Search…',
  inputClassName,
  onKeyDown,
}: AutocompleteInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onOpen]);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={
            inputClassName ??
            'w-full bg-stone-50 dark:bg-gray-800 border border-stone-200 dark:border-gray-700 rounded-md px-3 py-2 text-sm text-stone-900 dark:text-gray-100 placeholder-stone-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500'
          }
        />
        {loading && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
            <svg className="animate-spin h-4 w-4 text-stone-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          </span>
        )}
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-900 border border-stone-200 dark:border-gray-700 rounded-md shadow-lg max-h-56 overflow-y-auto">
          {results.map((r) => (
            <li key={r.symbol}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onSelect(r); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-stone-50 dark:hover:bg-gray-800 flex items-baseline gap-2"
              >
                <span className="font-semibold text-stone-900 dark:text-white shrink-0">{r.symbol}</span>
                <span className="text-stone-500 dark:text-gray-400 truncate">{r.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
