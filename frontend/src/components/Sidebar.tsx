import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Portfolio Profiler' },
  { to: '/investigator', label: 'Investigator' },
  { to: '/optimizer', label: 'Optimizer' },
];

export default function Sidebar() {
  return (
    <aside className="w-56 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col min-h-screen">
      <div className="px-5 py-6 border-b border-gray-800">
        <span className="text-lg font-semibold tracking-tight text-white">Almal</span>
      </div>
      <nav className="flex flex-col gap-1 px-3 py-4">
        {navItems.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              [
                'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100',
              ].join(' ')
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
