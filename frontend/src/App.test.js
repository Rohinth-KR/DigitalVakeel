import { render, screen } from '@testing-library/react';
import App from './App';

test('renders branded upload experience', () => {
  render(<App />);
  expect(screen.getByText(/Digital-Vakeel/i)).toBeInTheDocument();
  expect(screen.getByText(/MSME PAYMENT ENFORCEMENT AI/i)).toBeInTheDocument();
  expect(screen.getByText(/Continue to Review/i)).toBeInTheDocument();
});
