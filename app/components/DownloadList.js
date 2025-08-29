'use client';

export default function DownloadList({ downloads, onRemove, onUpdate }) {
  const getStatusColor = (status) => {
    switch (status) {
      case 'downloading':
        return 'text-blue-400';
      case 'completed':
        return 'text-green-400';
      case 'error':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const getStatusText = (download) => {
    switch (download.status) {
      case 'downloading':
        return download.progress > 0 ? `${download.progress}%` : 'Preparing...';
      case 'completed':
        return 'File saved successfully';
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
              {download.status === 'downloading' && download.progress > 0 && (
                <div className="w-full bg-[var(--box-toggle)] rounded-full h-2 mt-2">
                  <div
                    className="bg-[var(--select)] h-2 rounded-full transition-all duration-300"
                    style={{ width: `${download.progress}%` }}
                  ></div>
                </div>
              )}

              {/* Status and Speed */}
              <div className="flex justify-between items-center mt-2">
                <span className={`text-sm ${getStatusColor(download.status)}`}>
                  {getStatusText(download)}
                </span>
                {download.speed && (
                  <span className="text-sm text-gray-400">
                    Speed: {download.speed}
                  </span>
                )}
              </div>
            </div>

            {/* Remove Button */}
            <button
              onClick={() => onRemove(download.id)}
              className="flex-shrink-0 p-2 text-gray-400 hover:text-red-400 transition-colors duration-200"
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
        ))}
      </div>
    </div>
  );
}
