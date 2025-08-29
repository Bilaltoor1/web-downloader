import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

export async function POST(request) {
  try {
    const { 
      url, 
      format, 
      audioFormat, 
      type, 
      startTime, 
      endTime, 
      subtitles 
    } = await request.json();
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Create a temporary directory for downloads
    const tempDir = path.join(os.tmpdir(), 'ytdownloader');
    await fs.mkdir(tempDir, { recursive: true });

    // Generate filename
    const timestamp = Date.now();
    const ext = type === 'video' ? 'mp4' : 'm4a';
    const filename = `download_${timestamp}.${ext}`;
    const outputPath = path.join(tempDir, filename);

    // Build yt-dlp arguments
    const args = buildYtDlpArgs({
      url,
      format,
      audioFormat,
      type,
      startTime,
      endTime,
      subtitles,
      outputPath
    });

    // Start download
    const downloadedFile = await downloadVideo(args);
    
    // Read the file and return as blob
    const fileBuffer = await fs.readFile(downloadedFile);
    
    // Clean up temp file
    await fs.unlink(downloadedFile).catch(() => {}); // Ignore errors
    
    // Return the file as download
    return new Response(fileBuffer, {
      headers: {
        'Content-Type': type === 'video' ? 'video/mp4' : 'audio/mp4',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    });
    
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json(
      { error: 'Download failed' },
      { status: 500 }
    );
  }
}

function buildYtDlpArgs({ url, format, audioFormat, type, startTime, endTime, subtitles, outputPath }) {
  const args = [];
  
  // Format selection
  if (type === 'video') {
    if (audioFormat && audioFormat !== 'none') {
      args.push('-f', `${format}+${audioFormat}`);
    } else {
      args.push('-f', format);
    }
  } else {
    args.push('-x'); // Extract audio
    args.push('--audio-format', format.split('|')[1] || 'm4a');
    args.push('-f', format);
  }
  
  // Time range
  if (startTime) {
    args.push('--download-sections', `*${startTime}-${endTime || ''}`);
  }
  
  // Subtitles
  if (subtitles) {
    args.push('--write-sub');
    args.push('--write-auto-sub');
  }
  
  // Output
  args.push('-o', outputPath);
  
  // Other options
  args.push('--no-playlist');
  args.push('--no-check-certificate');
  
  // URL
  args.push(url);
  
  return args;
}

function downloadVideo(args) {
  return new Promise((resolve, reject) => {
    const ytdlp = spawn('yt-dlp', args);
    
    let outputPath = '';
    
    ytdlp.stdout.on('data', (data) => {
      const output = data.toString();
      // Parse output to get actual filename
      const match = output.match(/\[download\] Destination: (.+)/);
      if (match) {
        outputPath = match[1];
      }
    });
    
    ytdlp.stderr.on('data', (data) => {
      console.error('yt-dlp stderr:', data.toString());
    });
    
    ytdlp.on('close', (code) => {
      if (code === 0) {
        // Find the downloaded file
        if (outputPath && require('fs').existsSync(outputPath)) {
          resolve(outputPath);
        } else {
          // Try to find the file in the temp directory
          const tempDir = path.dirname(args[args.indexOf('-o') + 1]);
          const files = require('fs').readdirSync(tempDir);
          const downloadedFile = files.find(f => f.startsWith('download_'));
          if (downloadedFile) {
            resolve(path.join(tempDir, downloadedFile));
          } else {
            reject(new Error('Downloaded file not found'));
          }
        }
      } else {
        reject(new Error(`yt-dlp failed with code ${code}`));
      }
    });
    
    ytdlp.on('error', (error) => {
      reject(error);
    });
  });
}
