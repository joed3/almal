import { useTheme } from '../context/ThemeContext';

export interface ChartTheme {
  isDark: boolean;
  fontColor: string;
  gridcolor: string;
  axisColor: string;
  paperBgColor: string;
  plotBgColor: string;
}

export function useChartTheme(): ChartTheme {
  const { isDark } = useTheme();
  return {
    isDark,
    fontColor:    isDark ? '#d1d5db' : '#374151',
    gridcolor:    isDark ? '#374151' : '#e5e7eb',
    axisColor:    isDark ? '#9ca3af' : '#6b7280',
    paperBgColor: 'transparent',
    plotBgColor:  'transparent',
  };
}
