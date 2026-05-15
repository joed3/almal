import { renderHook, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { useChartTheme } from './useChartTheme';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider>{children}</ThemeProvider>
);

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});

describe('useChartTheme', () => {
  it('returns light-mode colors when no theme is stored', () => {
    const { result } = renderHook(() => useChartTheme(), { wrapper });
    expect(result.current.isDark).toBe(false);
    expect(result.current.fontColor).toBe('#374151');
    expect(result.current.gridcolor).toBe('#e5e7eb');
    expect(result.current.axisColor).toBe('#6b7280');
  });

  it('returns dark-mode colors when theme is stored as dark', () => {
    localStorage.setItem('almal-theme', 'dark');
    const { result } = renderHook(() => useChartTheme(), { wrapper });
    expect(result.current.isDark).toBe(true);
    expect(result.current.fontColor).toBe('#d1d5db');
    expect(result.current.gridcolor).toBe('#374151');
    expect(result.current.axisColor).toBe('#9ca3af');
  });

  it('paperBgColor and plotBgColor are always transparent', () => {
    const { result } = renderHook(() => useChartTheme(), { wrapper });
    expect(result.current.paperBgColor).toBe('transparent');
    expect(result.current.plotBgColor).toBe('transparent');
  });

  it('colors update reactively when theme is toggled', () => {
    const { result } = renderHook(
      () => ({ chart: useChartTheme(), theme: useTheme() }),
      { wrapper },
    );
    expect(result.current.chart.isDark).toBe(false);
    act(() => result.current.theme.toggleTheme());
    expect(result.current.chart.isDark).toBe(true);
    expect(result.current.chart.fontColor).toBe('#d1d5db');
    act(() => result.current.theme.toggleTheme());
    expect(result.current.chart.isDark).toBe(false);
    expect(result.current.chart.fontColor).toBe('#374151');
  });
});
