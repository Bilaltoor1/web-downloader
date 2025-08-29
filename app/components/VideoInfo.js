'use client';

import { useState } from 'react';

export default function VideoInfo({ videoInfo, onDownload, onUpdateDownload }) {
  const [activeTab, setActiveTab] = useState('video');
  const [selectedVideoFormat, setSelectedVideoFormat] = useState('');
  const [selectedAudioFormat, setSelectedAudioFormat] = useState('');
  const [selectedAudioForVideo, setSelectedAudioForVideo] = useState('none');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [downloadSubtitles, setDownloadSubtitles] = useState(false);

  // Mock video formats - replace with actual data from yt-dlp
  const videoFormats = videoInfo.formats?.videoFormats || [
    { id: '137+140', quality: '1080p', ext: 'mp4', size: '50MB', vcodec: 'avc1', selected: true },
    { id: '136+140', quality: '720p', ext: 'mp4', size: '30MB', vcodec: 'avc1' },
    { id: '135+140', quality: '480p', ext: 'mp4', size: '20MB', vcodec: 'avc1' },
    { id: '134+140', quality: '360p', ext: 'mp4', size: '15MB', vcodec: 'avc1' },
    { id: '133+140', quality: '240p', ext: 'mp4', size: '10MB', vcodec: 'avc1' },
    { id: '160+140', quality: '144p', ext: 'mp4', size: '5MB', vcodec: 'avc1' },
  ];

  const audioFormats = videoInfo.formats?.audioFormats || [
    { id: '140', quality: 'High', ext: 'm4a', size: '5MB', note: 'High quality' },
    { id: '139', quality: 'Medium', ext: 'm4a', size: '3MB', note: 'Medium quality' },
    { id: '138', quality: 'Low', ext: 'm4a', size: '2MB', note: 'Low quality' },
  ];

  const audioForVideoFormats = [
    { id: 'none', ext: 'none', label: 'No Audio' },
    { id: '140', ext: 'm4a', label: 'High quality m4a' },
    { id: '139', ext: 'm4a', label: 'Medium quality m4a' },
  ];

  // Initialize selected formats
  useState(() => {
    const defaultVideo = videoFormats.find(f => f.selected) || videoFormats[0];
    const defaultAudio = audioFormats[0];
    setSelectedVideoFormat(defaultVideo.id);
    setSelectedAudioFormat(defaultAudio.id);
  }, []);

  // Handle download with browser's download functionality
  const handleDownload = async (type) => {
    const downloadId = onDownload({
      title: videoInfo.title,
      type: type,
      thumbnail: videoInfo.thumbnail,
      format: type === 'video' ? selectedVideoFormat : selectedAudioFormat,
      audioFormat: type === 'video' ? selectedAudioForVideo : null,
      startTime,
      endTime,
      subtitles: downloadSubtitles,
    });

    // Simulate download process
    try {
      // Get download URL from your API
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: videoInfo.url,
          format: type === 'video' ? selectedVideoFormat : selectedAudioFormat,
          audioFormat: type === 'video' ? selectedAudioForVideo : null,
          type,
          startTime,
          endTime,
          subtitles: downloadSubtitles,
        }),
      });

      if (!response.ok) {
        throw new Error('Download failed');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      
      // Create temporary link and trigger download
      const link = document.createElement('a');
      link.href = downloadUrl;
      
      // Generate filename
      const ext = type === 'video' ? 'mp4' : 'm4a';
      const filename = `${videoInfo.title.replace(/[^a-zA-Z0-9]/g, '_')}.${ext}`;
      link.download = filename;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up
      window.URL.revokeObjectURL(downloadUrl);
      
      onUpdateDownload(downloadId, {
        status: 'completed',
        progress: 100,
      });
    } catch (error) {
      onUpdateDownload(downloadId, {
        status: 'error',
        error: error.message,
      });
    }
  };

  return (
    <div className="bg-[var(--box-main)] rounded-lg p-6 mb-6 text-left">
      {/* Video Title */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Title:</label>
        <input
          type="text"
          value={videoInfo.title}
          onChange={() => {}} // Handle title edit if needed
          className="w-full px-3 py-2 bg-[var(--box-toggle)] border border-[var(--box-separation)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--select)]"
        />
      </div>

      {/* Video/Audio Toggle */}
      <div className="flex mb-6">
        <button
          onClick={() => setActiveTab('video')}
          className={`px-6 py-3 rounded-l-lg font-medium transition-colors duration-200 ${
            activeTab === 'video'
              ? 'bg-[var(--box-toggleOn)] text-white'
              : 'bg-[var(--box-toggle)] hover:bg-[var(--box-separation)]'
          }`}
        >
          Video
        </button>
        <button
          onClick={() => setActiveTab('audio')}
          className={`px-6 py-3 rounded-r-lg font-medium transition-colors duration-200 ${
            activeTab === 'audio'
              ? 'bg-[var(--box-toggleOn)] text-white'
              : 'bg-[var(--box-toggle)] hover:bg-[var(--box-separation)]'
          }`}
        >
          Audio
        </button>
      </div>

      {/* Video Tab */}
      {activeTab === 'video' && (
        <div className="space-y-4">
          {/* Video Format Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Select Format:</label>
            <select
              value={selectedVideoFormat}
              onChange={(e) => setSelectedVideoFormat(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--box-toggle)] border border-[var(--box-separation)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--select)]"
            >
              {videoFormats.map((format) => (
                <option key={format.id} value={format.id}>
                  {format.quality.padEnd(8)} | {format.ext.padEnd(5)} | {format.vcodec.padEnd(8)} | {format.size}
                </option>
              ))}
            </select>
          </div>

          {/* Audio for Video Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Select Audio Format:</label>
            <select
              value={selectedAudioForVideo}
              onChange={(e) => setSelectedAudioForVideo(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--box-toggle)] border border-[var(--box-separation)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--select)]"
            >
              {audioForVideoFormats.map((format) => (
                <option key={format.id} value={format.id}>
                  {format.label}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => handleDownload('video')}
            className="px-6 py-3 bg-[var(--greenBtn)] hover:bg-[var(--greenBtn-bottom)] text-white rounded-lg font-medium transition-colors duration-200 mr-4"
          >
            Download
          </button>
        </div>
      )}

      {/* Audio Tab */}
      {activeTab === 'audio' && (
        <div className="space-y-4">
          {/* Audio Format Selection */}
          <div>
            <label className="block text-sm font-medium mb-2">Select Format:</label>
            <select
              value={selectedAudioFormat}
              onChange={(e) => setSelectedAudioFormat(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--box-toggle)] border border-[var(--box-separation)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--select)]"
            >
              {audioFormats.map((format) => (
                <option key={format.id} value={format.id}>
                  {format.note.padEnd(12)} | {format.ext.padEnd(4)} | {format.size}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => handleDownload('audio')}
            className="px-6 py-3 bg-[var(--greenBtn)] hover:bg-[var(--greenBtn-bottom)] text-white rounded-lg font-medium transition-colors duration-200 mr-4"
          >
            Download
          </button>
        </div>
      )}

      {/* More Options Toggle */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="px-4 py-2 bg-[var(--blueBtn)] hover:bg-[var(--blueBtn-bottom)] text-white rounded-lg font-medium transition-colors duration-200 mt-4"
      >
        More options
      </button>

      {/* Advanced Options */}
      {showAdvanced && (
        <div className="mt-6 p-4 bg-[var(--box-toggle)] rounded-lg space-y-4">
          {/* Time Range */}
          <div>
            <h3 className="font-medium mb-3">Download particular time-range</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-1">Start (HH:MM:SS)</label>
                <input
                  type="text"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  placeholder="00:00:00"
                  className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--box-separation)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--select)]"
                />
                <p className="text-xs text-gray-500 mt-1">If kept empty, it will start from the beginning</p>
              </div>
              <div>
                <label className="block text-sm mb-1">End (HH:MM:SS)</label>
                <input
                  type="text"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  placeholder="00:00:00"
                  className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--box-separation)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--select)]"
                />
                <p className="text-xs text-gray-500 mt-1">If kept empty, it will be downloaded to the end</p>
              </div>
            </div>
          </div>

          {/* Subtitles */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="subtitles"
              checked={downloadSubtitles}
              onChange={(e) => setDownloadSubtitles(e.target.checked)}
              className="w-4 h-4 text-[var(--select)] bg-[var(--background)] border-[var(--box-separation)] rounded focus:ring-[var(--select)] focus:ring-2"
            />
            <label htmlFor="subtitles" className="text-sm font-medium">
              Download subtitles if available
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
