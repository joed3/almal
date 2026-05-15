import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { ThemeProvider } from './context/ThemeContext';
import ErrorBoundary from './components/ErrorBoundary';
import TopNav from './components/TopNav';
import PortfolioUploadFAB from './components/PortfolioUploadFAB';
import PortfolioProfiler from './pages/PortfolioProfiler';
import PortfolioResearch from './pages/PortfolioResearch';
import DiversifyPage from './pages/DiversifyPage';
import Optimizer from './pages/Optimizer';

function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <BrowserRouter>
          <div className="min-h-screen bg-stone-50 dark:bg-gray-950 text-stone-900 dark:text-gray-100">
            <TopNav />
            <main className="overflow-auto">
              <ErrorBoundary>
                <Routes>
                  <Route path="/" element={<PortfolioProfiler />} />
                  <Route path="/research" element={<PortfolioResearch />} />
                  <Route path="/diversify" element={<DiversifyPage />} />
                  <Route path="/optimizer" element={<Optimizer />} />
                </Routes>
              </ErrorBoundary>
            </main>
            <PortfolioUploadFAB />
          </div>
        </BrowserRouter>
      </AppProvider>
    </ThemeProvider>
  );
}

export default App;
