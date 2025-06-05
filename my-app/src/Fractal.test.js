import { render, screen } from '@testing-library/react';
import Fractal from './Fractal';

// Mock for getContext is now global in setupTests.js

// Mock canvas properties that might be accessed if needed for specific tests,
// though generally better to have them in setupTests.js if universally applicable.
// Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', { configurable: true, value: 600 });
// Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', { configurable: true, value: 400 });


test('Fractal component renders a canvas element', () => {
  const { container } = render(<Fractal />);
  // Using querySelector as getByRole('graphics-document') can be unreliable for a plain canvas.
  const canvasElement = container.querySelector('canvas');
  expect(canvasElement).toBeInTheDocument();
  expect(canvasElement.tagName).toBe('CANVAS');

  // Also verify that WebGL context was requested (optional, but good for mock verification)
  // This checks if the mock in setupTests.js was indeed called.
  expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('webgl');
});
