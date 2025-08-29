import { NextResponse } from 'next/server';
import { spawn } from 'child_process';

export async function GET() {
  try {
    const isInstalled = await checkYtDlpInstallation();
    return NextResponse.json({ installed: isInstalled });
  } catch (error) {
    return NextResponse.json({ installed: false, error: error.message });
  }
}

function checkYtDlpInstallation() {
  return new Promise((resolve) => {
    const ytdlp = spawn('yt-dlp', ['--version']);
    
    ytdlp.on('close', (code) => {
      resolve(code === 0);
    });
    
    ytdlp.on('error', () => {
      resolve(false);
    });
  });
}
