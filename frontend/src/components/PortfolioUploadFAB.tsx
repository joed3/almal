import { useRef, useState } from 'react';
import { parseCSV } from '../utils/csv';
import { useAppContext } from '../context/AppContext';

export default function PortfolioUploadFAB() {
  const { portfolio, setPortfolio } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setParseError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = parseCSV(text);
        setPortfolio(parsed);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Failed to parse CSV.');
      }
    };
    reader.readAsText(file);
  }

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // reset so the same file can be re-uploaded
    e.target.value = '';
  };

  const fabClasses = portfolio
    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
    : 'bg-blue-600 hover:bg-blue-500 text-white';

  return (
    <>
      {/* FAB button */}
      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full shadow-lg font-medium text-sm transition-colors ${fabClasses}`}
        aria-label="Load portfolio"
      >
        {portfolio ? (
          <>
            {/* Check icon */}
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span>{portfolio.holdings.length} holdings</span>
          </>
        ) : (
          <>
            {/* Upload icon */}
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span>Load Portfolio</span>
          </>
        )}
      </button>

      {/* Modal */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsOpen(false);
          }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

          {/* Modal content */}
          <div className="relative w-full max-w-md bg-white dark:bg-gray-900 border border-stone-200 dark:border-gray-700 rounded-xl shadow-2xl p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-stone-900 dark:text-white">Portfolio</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-md text-stone-400 dark:text-gray-500 hover:text-stone-600 dark:hover:text-gray-300 hover:bg-stone-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Dropzone */}
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={[
                'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                isDragging
                  ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30'
                  : 'border-stone-300 dark:border-gray-700 hover:border-stone-400 dark:hover:border-gray-500',
              ].join(' ')}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={onFileInputChange}
              />
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 mx-auto mb-2 text-stone-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <p className="text-sm text-stone-600 dark:text-gray-300">Drag &amp; drop a CSV file here, or click to browse</p>
              <p className="text-xs text-stone-400 dark:text-gray-500 mt-1">
                Required columns: <code className="text-stone-500 dark:text-gray-400">ticker</code> and{' '}
                <code className="text-stone-500 dark:text-gray-400">shares</code>
              </p>
            </div>

            {/* Parse error */}
            {parseError && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-md px-3 py-2">
                {parseError}
              </p>
            )}

            {/* Loaded portfolio summary */}
            {portfolio && (
              <div className="mt-4 p-4 bg-stone-50 dark:bg-gray-800 rounded-lg border border-stone-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-stone-700 dark:text-gray-200">
                    {portfolio.holdings.length} holdings loaded
                  </p>
                  <button
                    onClick={() => {
                      setPortfolio(null);
                      setParseError(null);
                    }}
                    className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                  >
                    Clear
                  </button>
                </div>
                <p className="text-xs text-stone-500 dark:text-gray-400 leading-relaxed">
                  {portfolio.holdings.map((h) => h.ticker).join(', ')}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
