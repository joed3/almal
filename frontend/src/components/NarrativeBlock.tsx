import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface NarrativeBlockProps {
  narrative: string;
  title?: string;
}

function getVerdictBadgeClasses(verdict: string): string {
  const upper = verdict.toUpperCase();
  if (upper === 'OUTPERFORMING' || upper === 'STRONG') {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
  }
  if (upper === 'ON PAR' || upper === 'MODERATE') {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
  }
  if (upper === 'WEAK') {
    return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
  }
  if (upper === 'UNDERPERFORMING' || upper === 'AVOID') {
    return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
  }
  // fallback neutral
  return 'bg-stone-100 text-stone-700 dark:bg-gray-700 dark:text-gray-200';
}

export default function NarrativeBlock({ narrative, title = 'AI Analysis' }: NarrativeBlockProps) {
  // Check if first line contains VERDICT
  const lines = narrative.trim().split('\n');
  const firstLine = lines[0].trim();
  const verdictMatch = firstLine.match(/^VERDICT:\s*(.+)$/i);

  let verdict: string | null = null;
  let body: string = narrative;

  if (verdictMatch) {
    verdict = verdictMatch[1].trim();
    body = lines.slice(1).join('\n').trim();
  }

  return (
    <div className="bg-stone-50 dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-lg p-5">
      <div className="flex items-center gap-3 mb-3">
        <p className="text-xs font-medium text-stone-500 dark:text-slate-400 uppercase tracking-wide">
          {title}
        </p>
        {verdict && (
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getVerdictBadgeClasses(verdict)}`}>
            {verdict}
          </span>
        )}
      </div>
      <div className="prose-sm">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h2: ({ children }) => (
              <h2 className="font-semibold text-stone-800 dark:text-slate-100">{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 className="font-semibold text-stone-800 dark:text-slate-100">{children}</h3>
            ),
            strong: ({ children }) => (
              <strong className="font-semibold text-stone-800 dark:text-slate-100">{children}</strong>
            ),
            ul: ({ children }) => (
              <ul className="list-disc list-inside space-y-1">{children}</ul>
            ),
            li: ({ children }) => (
              <li className="text-stone-700 dark:text-slate-300">{children}</li>
            ),
            p: ({ children }) => (
              <p className="text-stone-700 dark:text-slate-200">{children}</p>
            ),
            a: ({ href, children }) => (
              <a
                href={href}
                className="text-blue-500 dark:text-blue-400 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            ),
            table: ({ children }) => (
              <table className="w-full text-sm border-collapse mt-2">{children}</table>
            ),
            th: ({ children }) => (
              <th className="text-left px-3 py-2 text-stone-500 dark:text-slate-400 border-b border-stone-300 dark:border-slate-600 font-medium">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="px-3 py-2 text-stone-600 dark:text-slate-300 border-b border-stone-200 dark:border-slate-700">
                {children}
              </td>
            ),
          }}
        >
          {body}
        </ReactMarkdown>
      </div>
    </div>
  );
}
