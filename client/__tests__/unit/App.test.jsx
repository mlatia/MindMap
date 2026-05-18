/**
 * App.test.jsx - smoke test untuk router & landing page.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../../src/App';

describe('App', () => {
  it('renders landing page heading', () => {
    render(<App />);
    // landing page menampilkan tagline "mind map"
    expect(screen.getByText(/mind map/i)).toBeInTheDocument();
  });

  it('renders Topbar brand', () => {
    render(<App />);
    expect(screen.getByText(/mind map otomatis/i)).toBeInTheDocument();
  });
});
