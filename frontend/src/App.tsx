import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { ThemeProvider } from './context/ThemeContext';
import ErrorBoundary from './components/ErrorBoundary';
import TopNav from './components/TopNav';
import PortfolioUploadFAB from './components/PortfolioUploadFAB';
import Investigator from './pages/Investigator';
import Optimizer from './pages/Optimizer';
import PortfolioProfiler from './pages/PortfolioProfiler';

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
                  <Route path="/investigator" element={<Investigator />} />
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
