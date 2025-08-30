'use client';

import { useState, useEffect, useRef } from 'react';
import { useTheme } from './ThemeProvider';
import LoadingSpinner from './LoadingSpinner';
import VideoInfo from './VideoInfo';
import DownloadList from './DownloadList';
import Menu from './Menu';
import SetupWarning from './SetupWarning';

export default function VideoDownloader() {
  const [url, setUrl] = useState('');
  const [videoInfo, setVideoInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [downloads, setDownloads] = useState([]);
  const [showMenu, setShowMenu] = useState(false);
  const { theme } = useTheme();

  // Handle URL paste from clipboard
  const handlePasteClick = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      if (text.trim()) {
        await fetchVideoInfo(text.trim());
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err);
    }
  };

  // Handle Ctrl+V keyboard shortcut
  useEffect(() => {
    const handleKeyDown = async (e) => {
      if (e.ctrlKey && e.key === 'v') {
        e.preventDefault();
        await handlePasteClick();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch video information
  const fetchVideoInfo = async (videoUrl) => {
    setLoading(true);
    setError('');
    setVideoInfo(null);

    try {
      // Simulate API call - replace with actual yt-dlp API call
      const response = await fetch('/api/video-info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: videoUrl }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch video information');
      }

      const data = await response.json();
      
      // Validate the response structure
      if (!data || !data.title) {
        throw new Error('Invalid video data received');
      }
      
      setVideoInfo(data);
    } catch (err) {
      setError(err.message || 'Some error has occurred. Check your network and use correct URL');
      console.error('Error fetching video info:', err);
    } finally {
      setLoading(false);
    }
  };

  // Add download to list
  const addDownload = (downloadData) => {
    const newDownload = {
      id: Date.now() + Math.random(),
      ...downloadData,
      status: 'downloading',
      progress: 0,
      speed: '',
    };
    setDownloads(prev => [...prev, newDownload]);
    return newDownload.id;
  };

  // Update download progress
  const updateDownload = (id, updates) => {
    setDownloads(prev => 
      prev.map(download => 
        download.id === id ? { ...download, ...updates } : download
      )
    );
  };

  // Remove download from list
  const removeDownload = (id) => {
    setDownloads(prev => prev.filter(download => download.id !== id));
  };

  return (
    <div className="min-h-screen p-4 text-center relative">
      {/* Setup Warning */}
      <SetupWarning />
      
      {/* Menu Icon */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="absolute top-4 right-4 w-10 h-10 rounded-lg hover:bg-[var(--box-toggle)] transition-colors duration-200"
        aria-label="Open menu"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          className="mx-auto"
        >
          <path
            d="M3 12H21M3 6H21M3 18H21"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Menu */}
      {showMenu && (
        <Menu onClose={() => setShowMenu(false)} />
      )}

      {/* Main Content */}
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 mt-8">YT Downloader</h1>

        {/* URL Input */}
        <button
          onClick={handlePasteClick}
          className="w-full max-w-md mx-auto mb-6 px-6 py-3 bg-[var(--greenBtn)] hover:bg-[var(--greenBtn-bottom)] text-white rounded-lg font-medium transition-colors duration-200"
        >
          Click to paste video URL or ID [Ctrl + V]
        </button>

        {/* Loading Spinner */}
        {loading && (
          <div className="mb-6">
            <LoadingSpinner />
            <p className="mt-4 text-lg">Loading...</p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-[var(--redBtn)] text-white rounded-lg">
            {error}
          </div>
        )}

        {/* Video Information */}
        {videoInfo && !loading && (
          <VideoInfo
            videoInfo={videoInfo}
            onDownload={addDownload}
            onUpdateDownload={updateDownload}
          />
        )}

        {/* Download List */}
        {downloads.length > 0 && (
          <DownloadList
            downloads={downloads}
            onRemove={removeDownload}
            onUpdate={updateDownload}
          />
        )}
      </div>
    </div>
  );
}
