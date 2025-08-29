'use client';

import { useState, useEffect } from 'react';

export default function SetupWarning() {
  const [ytdlpInstalled, setYtdlpInstalled] = useState(null);
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    checkYtDlpInstallation();
  }, []);

  const checkYtDlpInstallation = async () => {
    try {
      const response = await fetch('/api/check-ytdlp');
      const data = await response.json();
      setYtdlpInstalled(data.installed);
      setShowWarning(!data.installed);
    } catch (error) {
      console.error('Error checking yt-dlp installation:', error);
      setYtdlpInstalled(false);
      setShowWarning(true);
    }
  };

  if (!showWarning || ytdlpInstalled === null) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--box-main)] rounded-lg p-6 max-w-md w-full text-center">
        <h2 className="text-xl font-bold mb-4 text-red-400">Setup Required</h2>
        <p className="mb-4">
          yt-dlp is not installed or not found in your system PATH. This is required for downloading videos.
        </p>
        
        <div className="space-y-3 text-left mb-6">
          <h3 className="font-semibold">Installation Instructions:</h3>
          
          <div className="space-y-2">
            <h4 className="font-medium">Windows:</h4>
            <p className="text-sm bg-[var(--box-toggle)] p-2 rounded font-mono">
              pip install yt-dlp
            </p>
            <p className="text-xs text-gray-400">
              Or download from: <a href="https://github.com/yt-dlp/yt-dlp/releases" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">GitHub Releases</a>
            </p>
          </div>
          
          <div className="space-y-2">
            <h4 className="font-medium">macOS:</h4>
            <p className="text-sm bg-[var(--box-toggle)] p-2 rounded font-mono">
              brew install yt-dlp
            </p>
          </div>
          
          <div className="space-y-2">
            <h4 className="font-medium">Linux:</h4>
            <p className="text-sm bg-[var(--box-toggle)] p-2 rounded font-mono">
              sudo apt install yt-dlp
            </p>
            <p className="text-xs text-gray-400">or use pip: pip install yt-dlp</p>
          </div>
        </div>
        
        <div className="flex space-x-3">
          <button
            onClick={checkYtDlpInstallation}
            className="flex-1 px-4 py-2 bg-[var(--greenBtn)] hover:bg-[var(--greenBtn-bottom)] text-white rounded-lg font-medium transition-colors duration-200"
          >
            Check Again
          </button>
          <button
            onClick={() => setShowWarning(false)}
            className="flex-1 px-4 py-2 bg-[var(--box-toggle)] hover:bg-[var(--box-separation)] rounded-lg font-medium transition-colors duration-200"
          >
            Continue Anyway
          </button>
        </div>
      </div>
    </div>
  );
}
