import { render, screen } from '@testing-library/react';
import App from './App';

test('renders App component without crashing', () => {
  render(<App />);
  // Check if a primary element of App or a child is there, e.g., the container div
  const appElement = screen.getByRole('main'); // Assuming .App div could be considered main, or add role="main" to it
  // If .App doesn't have an implicit role, we might need a test-id or query differently.
  // For now, let's assume the Fractal's canvas is a good indicator App has rendered its content.
  expect(appElement).toBeInTheDocument();
});

test('renders Fractal component (canvas) within App', () => {
  const { container } = render(<App />);
  // The Fractal component renders a canvas.
  // Using querySelector as getByRole('graphics-document') can be unreliable for a plain canvas.
  const canvasElement = container.querySelector('canvas');
  expect(canvasElement).toBeInTheDocument();
  expect(canvasElement.tagName).toBe('CANVAS');
});
