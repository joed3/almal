import { NavLink } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useAppContext } from '../context/AppContext';

const navItems = [
  { to: '/',          label: 'Dashboard', end: true  },
  { to: '/research',  label: 'Research',  end: false },
  { to: '/diversify', label: 'Diversify', end: false },
  { to: '/optimizer', label: 'Optimize',  end: false },
];

export default function TopNav() {
  const { isDark, toggleTheme } = useTheme();
  const { portfolio } = useAppContext();

  const tickerPreview = portfolio
    ? (() => {
        const tickers = portfolio.holdings.map((h) => h.ticker);
        const shown = tickers.slice(0, 3).join(', ');
        const extra = tickers.length > 3 ? ` +${tickers.length - 3}` : '';
        return shown + extra;
      })()
    : null;

  return (
    <nav className="sticky top-0 z-40 bg-white dark:bg-gray-900 border-b border-stone-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center h-14 gap-6">
          {/* Wordmark */}
          <NavLink
            to="/"
            className="text-base font-semibold tracking-tight text-stone-900 dark:text-white shrink-0"
          >
            Almal
          </NavLink>

          {/* Nav links */}
          <div className="flex items-center gap-1">
            {navItems.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  [
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-stone-100 dark:bg-gray-800 text-stone-900 dark:text-white'
                      : 'text-stone-500 dark:text-gray-400 hover:text-stone-900 dark:hover:text-white hover:bg-stone-50 dark:hover:bg-gray-800/50',
                  ].join(' ')
                }
              >
                {label}
              </NavLink>
            ))}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Portfolio tickers preview */}
          {tickerPreview && (
            <span className="text-xs text-stone-500 dark:text-gray-400 hidden sm:block max-w-[200px] truncate">
              {tickerPreview}
            </span>
          )}

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="p-2 rounded-md text-stone-500 dark:text-gray-400 hover:text-stone-900 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-gray-800 transition-colors"
          >
            {isDark ? (
              /* Sun icon */
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              /* Moon icon */
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </nav>
  );
}
