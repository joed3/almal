/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { Portfolio } from '../utils/csv';

// We import types from wherever they are defined, or use any locally and cast.
// For simplicity, we use any for complex results to avoid circular imports
// if we don't want to extract all types immediately.
export type Horizon = '1M' | '3M' | '6M' | 'YTD' | '1Y' | '3Y' | 'Max';
export type OptimizationStrategy =
  | 'min_volatility'
  | 'max_sharpe'
  | 'max_return'
  | 'regularized_sharpe'
  | 'risk_parity'
  | 'cvar'
  | 'hrp'
  | 'black_litterman';

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
  investigatorSuggestResults: any | null;
  setInvestigatorSuggestResults: React.Dispatch<React.SetStateAction<any | null>>;
  investigatorSuggestMatrix: any | null;
  setInvestigatorSuggestMatrix: React.Dispatch<React.SetStateAction<any | null>>;
  investigatorPortfolioSectorMap: Record<string, string | null>;
  setInvestigatorPortfolioSectorMap: React.Dispatch<React.SetStateAction<Record<string, string | null>>>;
  investigatorSuggestSort: string;
  setInvestigatorSuggestSort: React.Dispatch<React.SetStateAction<string>>;
  investigatorPortfolioMetrics: any | null;
  setInvestigatorPortfolioMetrics: React.Dispatch<React.SetStateAction<any | null>>;

  // In-flight loading flags — persisted in context so navigation doesn't cancel work
  investigatorLoading: boolean;
  setInvestigatorLoading: React.Dispatch<React.SetStateAction<boolean>>;
  investigatorApiError: string | null;
  setInvestigatorApiError: React.Dispatch<React.SetStateAction<string | null>>;
  investigatorSuggestLoading: boolean;
  setInvestigatorSuggestLoading: React.Dispatch<React.SetStateAction<boolean>>;
  investigatorSuggestError: string | null;
  setInvestigatorSuggestError: React.Dispatch<React.SetStateAction<string | null>>;
  profilerLoading: boolean;
  setProfilerLoading: React.Dispatch<React.SetStateAction<boolean>>;
  profilerApiError: string | null;
  setProfilerApiError: React.Dispatch<React.SetStateAction<string | null>>;

  // Optimizer Persistence
  optimizerCandidates: string[];
  setOptimizerCandidates: React.Dispatch<React.SetStateAction<string[]>>;
  optimizerTickerInput: string;
  setOptimizerTickerInput: React.Dispatch<React.SetStateAction<string>>;
  optimizerPrincipal: number;
  setOptimizerPrincipal: React.Dispatch<React.SetStateAction<number>>;
  optimizerStrategy: OptimizationStrategy;
  setOptimizerStrategy: React.Dispatch<React.SetStateAction<OptimizationStrategy>>;
  optimizerRebalanceMode: boolean;
  setOptimizerRebalanceMode: React.Dispatch<React.SetStateAction<boolean>>;
  optimizerLockedTickers: string[];
  setOptimizerLockedTickers: React.Dispatch<React.SetStateAction<string[]>>;
  optimizerResult: any | null;
  setOptimizerResult: React.Dispatch<React.SetStateAction<any | null>>;
  optimizerBacktestResult: any | null;
  setOptimizerBacktestResult: React.Dispatch<React.SetStateAction<any | null>>;
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
  const [investigatorSuggestResults, setInvestigatorSuggestResults] = useState<any | null>(null);
  const [investigatorSuggestMatrix, setInvestigatorSuggestMatrix] = useState<any | null>(null);
  const [investigatorPortfolioSectorMap, setInvestigatorPortfolioSectorMap] = useState<Record<string, string | null>>({});
  const [investigatorSuggestSort, setInvestigatorSuggestSort] = useState<string>('correlation');
  const [investigatorPortfolioMetrics, setInvestigatorPortfolioMetrics] = useState<any | null>(null);

  // Loading / error state (in context so navigation doesn't abort in-flight requests)
  const [investigatorLoading, setInvestigatorLoading] = useState(false);
  const [investigatorApiError, setInvestigatorApiError] = useState<string | null>(null);
  const [investigatorSuggestLoading, setInvestigatorSuggestLoading] = useState(false);
  const [investigatorSuggestError, setInvestigatorSuggestError] = useState<string | null>(null);
  const [profilerLoading, setProfilerLoading] = useState(false);
  const [profilerApiError, setProfilerApiError] = useState<string | null>(null);

  // Optimizer state
  const [optimizerCandidates, setOptimizerCandidates] = useState<string[]>([]);
  const [optimizerTickerInput, setOptimizerTickerInput] = useState('');
  const [optimizerPrincipal, setOptimizerPrincipal] = useState<number>(100000);
  const [optimizerStrategy, setOptimizerStrategy] = useState<OptimizationStrategy>('max_sharpe');
  const [optimizerRebalanceMode, setOptimizerRebalanceMode] = useState<boolean>(false);
  const [optimizerLockedTickers, setOptimizerLockedTickers] = useState<string[]>([]);
  const [optimizerResult, setOptimizerResult] = useState<any | null>(null);
  const [optimizerBacktestResult, setOptimizerBacktestResult] = useState<any | null>(null);

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
        investigatorSuggestResults,
        setInvestigatorSuggestResults,
        investigatorSuggestMatrix,
        setInvestigatorSuggestMatrix,
        investigatorPortfolioSectorMap,
        setInvestigatorPortfolioSectorMap,
        investigatorSuggestSort,
        setInvestigatorSuggestSort,
        investigatorPortfolioMetrics,
        setInvestigatorPortfolioMetrics,

        investigatorLoading,
        setInvestigatorLoading,
        investigatorApiError,
        setInvestigatorApiError,
        investigatorSuggestLoading,
        setInvestigatorSuggestLoading,
        investigatorSuggestError,
        setInvestigatorSuggestError,
        profilerLoading,
        setProfilerLoading,
        profilerApiError,
        setProfilerApiError,

        optimizerCandidates,
        setOptimizerCandidates,
        optimizerTickerInput,
        setOptimizerTickerInput,
        optimizerPrincipal,
        setOptimizerPrincipal,
        optimizerStrategy,
        setOptimizerStrategy,
        optimizerRebalanceMode,
        setOptimizerRebalanceMode,
        optimizerLockedTickers,
        setOptimizerLockedTickers,
        optimizerResult,
        setOptimizerResult,
        optimizerBacktestResult,
        setOptimizerBacktestResult,
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
