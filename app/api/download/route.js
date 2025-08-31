import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

function getSpawnEnv() {
  const bins = [];
  if (ffmpegStatic) bins.push(path.dirname(ffmpegStatic));
  if (ffprobeStatic && ffprobeStatic.path) bins.push(path.dirname(ffprobeStatic.path));
  const delim = path.delimiter;
  const extra = bins.join(delim);
  return { ...process.env, PATH: extra ? `${extra}${delim}${process.env.PATH || ''}` : process.env.PATH };
}

export async function POST(request) {
  try {
    const { url, formatId, type } = await request.json();
    
    console.log('Download request:', { url, formatId, type });
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Create a temporary directory for downloads
    const tempDir = path.join(os.tmpdir(), 'ytdownloader');
    await fs.mkdir(tempDir, { recursive: true });

    // Generate a simple filename template
    const timestamp = Date.now();
    const outputTemplate = path.join(tempDir, `download_${timestamp}.%(ext)s`);
    
    console.log('Output template:', outputTemplate);
    
    // Build yt-dlp arguments based on type
  const args = [url, '-o', outputTemplate];
    
    if (type === 'audio') {
      // Audio only (no postprocessing, let browser save the native stream)
      args.push('-f', 'bestaudio/best');
    } else {
      // For video - use single format to avoid FFmpeg merge requirement
      if (formatId && formatId !== 'best') {
        // Extract just the video format ID (before any +)
        const videoFormatId = formatId.split('+')[0];
        console.log('Using video format:', videoFormatId);
        args.push('-f', `${videoFormatId}/best[ext=mp4]/best`);
      } else {
        // Default to best quality single format
        args.push('-f', 'best[ext=mp4]/best');
      }
    }
    
    // Add safety options
  args.push('--no-warnings');
  args.push('--no-playlist');
  args.push('--no-check-certificate');
  args.push('--ignore-config');
    if (ffmpegStatic) {
      args.push('--ffmpeg-location', path.dirname(ffmpegStatic));
    }
    
    console.log('yt-dlp command:', 'yt-dlp', args.join(' '));
    
    // Download the video
    const downloadedFile = await downloadVideo(args);
    console.log('Download completed:', downloadedFile);
    
    // Read the file and return as blob
    const fileBuffer = await fs.readFile(downloadedFile);
    const stats = await fs.stat(downloadedFile);
    
    // Get file extension and set appropriate headers
    const ext = path.extname(downloadedFile).toLowerCase();
    let contentType = 'application/octet-stream';
    let filename = `download_${timestamp}${ext}`;
    
    if (ext === '.mp4') {
      contentType = 'video/mp4';
      filename = `video_${timestamp}.mp4`;
    } else if (ext === '.webm') {
      contentType = 'video/webm';
      filename = `video_${timestamp}.webm`;
    } else if (ext === '.m4a') {
      contentType = 'audio/mp4';
      filename = `audio_${timestamp}.m4a`;
    } else if (ext === '.mp3') {
      contentType = 'audio/mpeg';
      filename = `audio_${timestamp}.mp3`;
    }
    
    console.log('Serving file:', { filename, contentType, size: stats.size });
    
    // Clean up temp file
    await fs.unlink(downloadedFile).catch(err => {
      console.error('Cleanup error:', err);
    });
    
    // Return the file as download
    return new Response(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': 'no-cache',
      },
    });
    
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json(
      { error: `Download failed: ${error.message}` },
      { status: 500 }
    );
  }
}

function downloadVideo(args) {
  return new Promise((resolve, reject) => {
    console.log('Running yt-dlp with args:', args.join(' '));
    
  const ytdlp = spawn('yt-dlp', args, { env: getSpawnEnv() });
    
    let outputPath = '';
    let hasError = false;
    
    ytdlp.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('yt-dlp stdout:', output);
      
      // Parse output to get actual filename
      const destinationMatch = output.match(/\[download\] Destination: (.+)/);
      const alreadyMatch = output.match(/\[download\] (.+) has already been downloaded/);
      
      if (destinationMatch) {
        outputPath = destinationMatch[1].trim();
      } else if (alreadyMatch) {
        outputPath = alreadyMatch[1].trim();
      }
    });
    
    ytdlp.stderr.on('data', (data) => {
      const error = data.toString();
      console.log('yt-dlp stderr:', error);
      
      // Only treat actual errors as errors, not warnings
      if (error.includes('ERROR:')) {
        hasError = true;
      }
    });
    
    ytdlp.on('close', (code) => {
      console.log(`yt-dlp process closed with code: ${code}`);
      
      if (code === 0 && !hasError) {
        // Find the downloaded file
        if (outputPath && require('fs').existsSync(outputPath)) {
          console.log('Found downloaded file:', outputPath);
          resolve(outputPath);
        } else {
          // Try to find the file in the temp directory
          const tempDir = path.dirname(args[args.indexOf('-o') + 1]);
          console.log('Looking for files in:', tempDir);
          
          try {
            const files = require('fs').readdirSync(tempDir);
            console.log('Files in temp dir:', files);
            
            const downloadedFile = files.find(f => 
              f.startsWith('download_') && 
              (f.endsWith('.mp4') || f.endsWith('.m4a') || f.endsWith('.webm') || f.endsWith('.mkv'))
            );
            
            if (downloadedFile) {
              const fullPath = path.join(tempDir, downloadedFile);
              console.log('Found downloaded file:', fullPath);
              resolve(fullPath);
            } else {
              reject(new Error('Downloaded file not found'));
            }
          } catch (err) {
            reject(new Error(`Error reading temp directory: ${err.message}`));
          }
        }
      } else {
        reject(new Error(`yt-dlp failed with code ${code}`));
      }
    });
    
    ytdlp.on('error', (error) => {
      console.error('yt-dlp spawn error:', error);
      reject(error);
    });
  });
}
