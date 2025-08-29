'use client';

import { useTheme } from './ThemeProvider';

export default function Menu({ onClose }) {
  const { theme, changeTheme } = useTheme();

  const themes = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'frappe', label: 'Frappé' },
    { value: 'onedark', label: 'One Dark' },
    { value: 'matrix', label: 'Matrix' },
    { value: 'github', label: 'GitHub' },
    { value: 'latte', label: 'Latte' },
    { value: 'solarized-dark', label: 'Solarized Dark' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      ></div>

      {/* Menu */}
      <div className="fixed top-4 right-4 bg-[var(--box-main)] rounded-lg shadow-lg p-4 z-50 min-w-[250px]">
        <div className="space-y-3">
          {/* Menu Items */}
          <button
            onClick={() => {
              // Navigate to playlist downloader
              onClose();
            }}
            className="block w-full text-left px-3 py-2 rounded hover:bg-[var(--box-toggle)] transition-colors duration-200"
          >
            Download Playlist
          </button>

          <button
            onClick={() => {
              // Navigate to preferences
              onClose();
            }}
            className="block w-full text-left px-3 py-2 rounded hover:bg-[var(--box-toggle)] transition-colors duration-200"
          >
            Preferences
          </button>

          <button
            onClick={() => {
              // Navigate to compressor
              onClose();
            }}
            className="block w-full text-left px-3 py-2 rounded hover:bg-[var(--box-toggle)] transition-colors duration-200"
          >
            Compressor
          </button>

          <button
            onClick={() => {
              // Navigate to about
              onClose();
            }}
            className="block w-full text-left px-3 py-2 rounded hover:bg-[var(--box-toggle)] transition-colors duration-200"
          >
            About
          </button>

          {/* Theme Selector */}
          <div className="border-t border-[var(--box-separation)] pt-3">
            <label className="block text-sm font-medium mb-2">Theme:</label>
            <select
              value={theme}
              onChange={(e) => changeTheme(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--box-toggle)] border border-[var(--box-separation)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--select)]"
            >
              {themes.map((themeOption) => (
                <option key={themeOption.value} value={themeOption.value}>
                  {themeOption.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </>
  );
}
