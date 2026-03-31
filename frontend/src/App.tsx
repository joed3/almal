import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import Investigator from './pages/Investigator';
import Optimizer from './pages/Optimizer';
import PortfolioProfiler from './pages/PortfolioProfiler';

function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <div className="flex min-h-screen bg-gray-950 text-gray-100">
          <Sidebar />
          <main className="flex-1 overflow-auto">
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<PortfolioProfiler />} />
                <Route path="/investigator" element={<Investigator />} />
                <Route path="/optimizer" element={<Optimizer />} />
              </Routes>
            </ErrorBoundary>
          </main>
        </div>
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;
