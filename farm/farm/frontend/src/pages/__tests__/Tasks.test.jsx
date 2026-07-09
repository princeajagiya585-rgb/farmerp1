import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Tasks from '../Tasks'; // Adjust path as necessary

// Mocking external dependencies
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key, // Simply return the key for testing purposes
    i18n: { changeLanguage: jest.fn() },
  }),
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    hasRole: jest.fn((role) => {
      if (role === 'EMPLOYEE') return true; // Mock as an employee for most tests
      return false;
    }),
    user: { id: 'test-user-id', full_name: 'Test User' },
  }),
}));

// Mock resource and toFormData from api.js
const mockResource = jest.fn((path) => {
  const mockMethods = {
    create: jest.fn((data) => Promise.resolve({ success: true, data: data })),
    list: jest.fn(() => Promise.resolve({ results: [], count: 0 })), // Add list method
    // Add other methods as needed
  };
  return mockMethods;
});

jest.mock('../../lib/api', () => ({
  resource: mockResource,
  toFormData: jest.fn((data) => {
    const formData = new FormData();
    for (const key in data) {
      formData.append(key, data[key]);
    }
    return formData;
  }),
}));

// Mock navigator.geolocation
const mockGeolocation = {
  getCurrentPosition: jest.fn((success, error, options) => {
    success({
      coords: {
        latitude: 12.345678,
        longitude: 98.765432,
        accuracy: 10,
      },
    });
  }),
};
Object.defineProperty(global.navigator, 'geolocation', {
  value: mockGeolocation,
  writable: true,
});

// Mock useToast
jest.mock('../../components/ui', () => ({
  ...jest.requireActual('../../components/ui'), // Import and retain default exports
  useToast: () => ([
    [], // toasts array
    jest.fn(), // addToast function
    jest.fn(), // removeToast function
  ]),
  // Mock Badge and Button if they cause issues or need specific behavior
  Badge: ({ children }) => <span>{children}</span>,
  Button: ({ children, onClick, ...props }) => <button onClick={onClick} {...props}>{children}</button>,
}));

// Mock CrudResource itself to control its rendering
jest.mock('../../components/CrudResource', () => ({
  __esModule: true,
  default: ({ title, subtitle, columns, rowActions, listParams, extraToolbar }) => {
    // Render the title and subtitle to ensure CrudResource is called
    return (
      <div>
        <h1>{title}</h1>
        <h2>{subtitle}</h2>
        {extraToolbar}
        {/* Simulate rendering a row and its actions for testing */}
        <div>
          {rowActions({
            id: 'mock-task-id',
            title: 'Mock Task',
            status: 'TODO',
            work_phase: 'BEFORE', // Or other phases for different tests
            total_tracked_minutes: 0,
            active_session: null,
          }, jest.fn())}
        </div>
      </div>
    );
  },
}));


describe('Tasks Component', () => {
  const mockTask = {
    id: 'task-1',
    title: 'Test Task',
    status: 'TODO',
    work_phase: 'BEFORE', // Initial phase for the task being tested
    total_tracked_minutes: 0,
    active_session: null,
  };

  const mockReload = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockGeolocation.getCurrentPosition.mockImplementation((success) => {
      success({
        coords: {
          latitude: 12.345678,
          longitude: 98.765432,
          accuracy: 10,
        },
      });
    });
    // Reset mock for resource.list in case it was called in previous tests
    mockResource('farms').list.mockClear();
    mockResource('workforce/employees').list.mockClear();
  });

  it('renders the CrudResource and the "Before Work" button initially for a new task', async () => {
    render(<Tasks />);

    // Verify CrudResource is rendered with its title
    expect(screen.getByText('tasks.titlePg')).toBeInTheDocument();

    // Verify the "Before Work" button is present (rendered by the mocked CrudResource's rowActions)
    expect(screen.getByRole('button', { name: 'gps.beforeWork' })).toBeInTheDocument();
  });

  it('opens the Before Work modal when "Before Work" button is clicked', async () => {
    render(<Tasks />);
    const beforeWorkButton = screen.getByRole('button', { name: 'gps.beforeWork' });
    fireEvent.click(beforeWorkButton);

    await waitFor(() => {
      expect(screen.getByText('gps.currentLocation')).toBeInTheDocument();
      expect(screen.getByText('gps.clickPhoto')).toBeInTheDocument();
    });
  });

  it('submits Before Work with photo and location', async () => {
    render(<Tasks />);
    fireEvent.click(screen.getByRole('button', { name: 'gps.beforeWork' }));

    await waitFor(() => {
      expect(screen.getByText('gps.currentLocation')).toBeInTheDocument();
    });

    // Simulate photo input
    const file = new File(['(⌐□_□)'], 'test.png', { type: 'image/png' });
    const photoInput = screen.getByLabelText('common.workPhoto');
    fireEvent.change(photoInput, { target: { files: [file] } });

    // Assuming the submit button within the modal is also labeled 'gps.beforeWork'
    const submitButtonInModal = screen.getByRole('button', { name: 'gps.beforeWork' });
    fireEvent.click(submitButtonInModal);

    await waitFor(() => {
      expect(mockResource('gps/pings').create).toHaveBeenCalledWith(expect.any(FormData));
      // You'd also check if mockReload was called, but that's within the CrudResource mock
    });
  });

  // Add more tests for DURING_WORK, BREAK, RESUME, COMPLETED states and their interactions
});