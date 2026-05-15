import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import AutocompleteInput from './AutocompleteInput';

const baseProps = {
  value: '',
  onChange: vi.fn(),
  onSelect: vi.fn(),
  results: [],
  open: false,
  onOpen: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AutocompleteInput', () => {
  it('renders with custom placeholder', () => {
    render(<AutocompleteInput {...baseProps} placeholder="Search tickers…" />);
    expect(screen.getByPlaceholderText('Search tickers…')).toBeInTheDocument();
  });

  it('uses default placeholder when none provided', () => {
    render(<AutocompleteInput {...baseProps} />);
    expect(screen.getByPlaceholderText('Search…')).toBeInTheDocument();
  });

  it('calls onChange with the new value when user types', () => {
    const onChange = vi.fn();
    render(<AutocompleteInput {...baseProps} onChange={onChange} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'AAPL' } });
    expect(onChange).toHaveBeenCalledWith('AAPL');
  });

  it('does not render dropdown when open is false', () => {
    const results = [{ symbol: 'AAPL', name: 'Apple Inc.' }];
    render(<AutocompleteInput {...baseProps} results={results} open={false} />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('does not render dropdown when open is true but results are empty', () => {
    render(<AutocompleteInput {...baseProps} results={[]} open={true} />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('renders all results in the dropdown when open', () => {
    const results = [
      { symbol: 'AAPL', name: 'Apple Inc.' },
      { symbol: 'MSFT', name: 'Microsoft Corp.' },
    ];
    render(<AutocompleteInput {...baseProps} results={results} open={true} />);
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();
    expect(screen.getByText('Microsoft Corp.')).toBeInTheDocument();
  });

  it('calls onSelect with the full result object on item click', () => {
    const onSelect = vi.fn();
    const results = [{ symbol: 'AAPL', name: 'Apple Inc.' }];
    render(
      <AutocompleteInput
        {...baseProps}
        results={results}
        open={true}
        onSelect={onSelect}
      />,
    );
    fireEvent.mouseDown(screen.getByRole('button', { name: /AAPL/i }));
    expect(onSelect).toHaveBeenCalledWith({ symbol: 'AAPL', name: 'Apple Inc.' });
  });

  it('shows loading spinner when loading is true', () => {
    const { container } = render(<AutocompleteInput {...baseProps} loading={true} />);
    expect(container.querySelector('svg.animate-spin')).toBeInTheDocument();
  });

  it('does not show loading spinner when loading is false', () => {
    const { container } = render(<AutocompleteInput {...baseProps} loading={false} />);
    expect(container.querySelector('svg.animate-spin')).not.toBeInTheDocument();
  });

  it('calls onKeyDown when a key is pressed in the input', () => {
    const onKeyDown = vi.fn();
    render(<AutocompleteInput {...baseProps} onKeyDown={onKeyDown} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onKeyDown).toHaveBeenCalled();
  });
});
