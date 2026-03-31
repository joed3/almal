/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { Portfolio } from '../utils/csv';

// We import types from wherever they are defined, or use any locally and cast.
// For simplicity, we use any for complex results to avoid circular imports
// if we don't want to extract all types immediately.
export type Horizon = '1M' | '3M' | '6M' | 'YTD' | '1Y' | '3Y' | 'Max';

interface AppContextType {
  // Global Shared State
  portfolio: Portfolio | null;
  setPortfolio: React.Dispatch<React.SetStateAction<Portfolio | null>>;

  // Profiler Persistence
  profilerResult: any | null;
  setProfilerResult: React.Dispatch<React.SetStateAction<any | null>>;
  selectedBenchmarks: string[];
  setSelectedBenchmarks: React.Dispatch<React.SetStateAction<string[]>>;
  horizon: Horizon;
  setHorizon: React.Dispatch<React.SetStateAction<Horizon>>;

  // Investigator Persistence
  investigatorSearchQuery: string;
  setInvestigatorSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  selectedTicker: string | null;
  setSelectedTicker: React.Dispatch<React.SetStateAction<string | null>>;
  investigatorResult: any | null;
  setInvestigatorResult: React.Dispatch<React.SetStateAction<any | null>>;
  investigatorNarrative: string | null;
  setInvestigatorNarrative: React.Dispatch<React.SetStateAction<string | null>>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);

  // Profiler state
  const [profilerResult, setProfilerResult] = useState<any | null>(null);
  const [selectedBenchmarks, setSelectedBenchmarks] = useState<string[]>(['SPY']);
  const [horizon, setHorizon] = useState<Horizon>('1Y');

  // Investigator state
  const [investigatorSearchQuery, setInvestigatorSearchQuery] = useState('');
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [investigatorResult, setInvestigatorResult] = useState<any | null>(null);
  const [investigatorNarrative, setInvestigatorNarrative] = useState<string | null>(null);

  return (
    <AppContext.Provider
      value={{
        portfolio,
        setPortfolio,

        profilerResult,
        setProfilerResult,
        selectedBenchmarks,
        setSelectedBenchmarks,
        horizon,
        setHorizon,

        investigatorSearchQuery,
        setInvestigatorSearchQuery,
        selectedTicker,
        setSelectedTicker,
        investigatorResult,
        setInvestigatorResult,
        investigatorNarrative,
        setInvestigatorNarrative,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
