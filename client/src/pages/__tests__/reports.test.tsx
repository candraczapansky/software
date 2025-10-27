import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Reports from '../reports';

// Mock the query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

// Mock the API requests
jest.mock('@/lib/queryClient', () => ({
  apiRequest: jest.fn(),
}));

// Mock the context providers
jest.mock('@/contexts/LocationContext', () => ({
  useLocation: () => ({
    selectedLocation: { id: 1, name: 'Test Location' },
    locations: [{ id: 1, name: 'Test Location' }],
  }),
}));

describe('Reports Page', () => {
  const renderReports = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <Reports />
      </QueryClientProvider>
    );
  };

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('renders the reports page', async () => {
    renderReports();
    
    // Check for main sections
    expect(screen.getByText(/Reports/i)).toBeInTheDocument();
    expect(screen.getByText(/Date Range/i)).toBeInTheDocument();
  });

  it('allows date range selection', async () => {
    renderReports();
    
    // Find and click date range selector
    const dateRangeButton = screen.getByRole('button', { name: /select date range/i });
    await userEvent.click(dateRangeButton);
    
    // Verify date picker is shown
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('loads report data when filters change', async () => {
    renderReports();
    
    // Change date range
    const dateRangeButton = screen.getByRole('button', { name: /select date range/i });
    await userEvent.click(dateRangeButton);
    
    // Select a date range (implementation depends on your date picker component)
    
    // Verify loading state
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    
    // Wait for data to load
    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    });
  });

  // Add more test cases for specific report types
  it('switches between report types', async () => {
    renderReports();
    
    // Find and click report type selector
    const reportTypeSelect = screen.getByRole('combobox', { name: /report type/i });
    await userEvent.click(reportTypeSelect);
    
    // Select different report type
    const salesOption = screen.getByRole('option', { name: /sales/i });
    await userEvent.click(salesOption);
    
    // Verify report type changed
    expect(reportTypeSelect).toHaveValue('sales');
  });
});
