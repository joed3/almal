import type { ReactNode } from 'react';

interface InfoPopoverProps {
  title?: string;
  content: ReactNode;
  wikiUrl?: string;
}

export default function InfoPopover({ title, content, wikiUrl }: InfoPopoverProps) {
  return (
    <span className="relative ml-1 cursor-default group inline-flex items-center">
      <svg
        className="w-3.5 h-3.5 text-stone-400 dark:text-gray-500 group-hover:text-stone-600 dark:group-hover:text-gray-300 transition-colors"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="8" strokeLinecap="round" />
        <line x1="12" y1="12" x2="12" y2="16" strokeLinecap="round" />
      </svg>
      {/* Tooltip */}
      <div
        className={[
          'absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 z-50 text-left',
          'bg-white dark:bg-gray-900 border border-stone-200 dark:border-gray-700 rounded-lg px-3 py-2 shadow-xl',
          'opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto',
          'transition-opacity duration-150',
        ].join(' ')}
      >
        {title && <p className="text-xs text-stone-900 dark:text-white font-semibold mb-1">{title}</p>}
        <p className="text-xs text-stone-700 dark:text-slate-300 leading-snug font-normal normal-case whitespace-normal tracking-normal">{content}</p>
        {wikiUrl && (
          <a
            href={wikiUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 dark:text-blue-400 hover:underline mt-1 inline-block font-normal normal-case tracking-normal"
          >
            Learn more →
          </a>
        )}
      </div>
    </span>
  );
}
