'use client';

export default function DownloadList({ downloads, onRemove, onUpdate }) {
  const getStatusColor = (status) => {
    switch (status) {
      case 'downloading':
        return 'text-blue-400';
      case 'completed':
      case 'saved':
        return 'text-green-400';
      case 'error':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const getStatusText = (download) => {
    switch (download.status) {
      case 'starting':
        return 'Starting download...';
      case 'downloading':
        return download.progress > 0 ? `${download.progress}%` : 'Preparing...';
      case 'downloading_video':
        return `Downloading video... ${download.progress}%`;
      case 'downloading_audio':
        return `Downloading audio... ${download.progress}%`;
      case 'merging':
        return `Merging video and audio... ${download.progress}%`;
      case 'completed':
        return 'Download completed';
      case 'saved':
        return 'File saved to downloads';
      case 'error':
        return download.error || 'Download failed';
      default:
        return 'Unknown status';
    }
  };

  return (
    <div className="bg-[var(--box-main)] rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-4">Downloads</h2>
      <div className="space-y-4">
        {downloads.map((download) => (
          <div
            key={download.id}
            className="flex items-center space-x-4 p-4 bg-[var(--item-bg)] rounded-lg"
          >
            {/* Thumbnail */}
            <div className="flex-shrink-0">
              <img
                src={download.thumbnail || '/placeholder-thumb.svg'}
                alt="Thumbnail"
                className="w-16 h-12 object-cover rounded"
                onError={(e) => {
                  e.target.src = '/placeholder-thumb.svg';
                }}
              />
              <span className="block text-xs text-center mt-1 capitalize">
                {download.type}
              </span>
            </div>

            {/* Download Info */}
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium truncate">
                {download.title}
              </h3>
              
              {/* Progress Bar */}
              {(download.status === 'downloading' || 
                download.status === 'downloading_video' || 
                download.status === 'downloading_audio' || 
                download.status === 'merging') && download.progress > 0 && (
                <div className="w-full bg-[var(--box-toggle)] rounded-full h-2 mt-2">
                  <div
                    className="bg-[var(--select)] h-2 rounded-full transition-all duration-300"
                    style={{ width: `${download.progress}%` }}
                  ></div>
                </div>
              )}

              {/* Status and Progress Info */}
              <div className="flex justify-between items-center mt-2">
                <span className={`text-sm ${getStatusColor(download.status)}`}>
                  {getStatusText(download)}
                  {download.step && ` - ${download.step}`}
                </span>
                {download.speed && download.speed !== '0 B/s' && (
                  <span className="text-xs text-gray-400">
                    {download.speed}
                  </span>
                )}
              </div>
              
              {/* Additional Info: Size and ETA */}
              {(download.size || download.eta) && (
                <div className="flex justify-between items-center mt-1">
                  {download.size && download.size !== '0 B' && (
                    <span className="text-xs text-gray-500">
                      Size: {download.size}
                    </span>
                  )}
                  {download.eta && download.eta !== '00:00' && (
                    <span className="text-xs text-gray-500">
                      ETA: {download.eta}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex-shrink-0">
              {/* Remove Button */}
              <button
                onClick={() => onRemove(download.id)}
                className="p-2 text-gray-400 hover:text-red-400 transition-colors duration-200"
                title="Remove download"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
