'use client';

import { useState, useEffect, useRef } from 'react';
import VideoDownloader from './components/VideoDownloader';
import ThemeProvider from './components/ThemeProvider';

export default function Home() {
  return (
    <ThemeProvider>
      <div className="min-h-screen font-[family-name:var(--font-ubuntu)]">
        <VideoDownloader />
      </div>
    </ThemeProvider>
  );
}
