import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { activeDownloads } from '../shared-state';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Configure fluent-ffmpeg to use bundled binaries
const ffmpegBin = ffmpegStatic || null;
const ffprobeBin = (ffprobeStatic && ffprobeStatic.path) || null;

console.log('FFmpeg binary paths:', {
  ffmpegStatic,
  ffmpegBin,
  ffprobeStatic: ffprobeStatic?.path,
  ffprobeBin,
  cwd: process.cwd()
});

// Fix path resolution for Windows
let resolvedFfmpegPath = ffmpegBin;
let resolvedFfprobePath = ffprobeBin;

if (ffmpegBin && !path.isAbsolute(ffmpegBin)) {
  resolvedFfmpegPath = path.resolve(process.cwd(), ffmpegBin);
}
if (ffprobeBin && !path.isAbsolute(ffprobeBin)) {
  resolvedFfprobePath = path.resolve(process.cwd(), ffprobeBin);
}

console.log('Resolved paths:', {
  resolvedFfmpegPath,
  resolvedFfprobePath
});

if (resolvedFfmpegPath && typeof ffmpeg.setFfmpegPath === 'function') {
  ffmpeg.setFfmpegPath(resolvedFfmpegPath);
}
if (resolvedFfprobePath && typeof ffmpeg.setFfprobePath === 'function') {
  ffmpeg.setFfprobePath(resolvedFfprobePath);
}

export async function POST(request) {
  try {
    const { url, videoFormatId, audioFormatId, type } = await request.json();
    
    console.log('Download progress request:', { url, videoFormatId, audioFormatId, type });
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Generate download ID
    const downloadId = Date.now().toString();
    console.log('Generated download ID:', downloadId);
    const tempDir = path.join(os.tmpdir(), 'ytdownloader', downloadId);
    await fs.mkdir(tempDir, { recursive: true });

    // Initialize download state
    const downloadState = {
      id: downloadId,
      status: 'starting',
      progress: 0,
      speed: '',
      eta: '',
      downloadedBytes: 0,
      totalBytes: 0,
      currentFile: '',
      error: null,
      filename: '',
      tempDir: tempDir,
      finalPath: null,
      readyForSave: false
    };

    activeDownloads.set(downloadId, downloadState);
    console.log('Download state added to activeDownloads:', downloadId);
    console.log('Active downloads after adding:', Array.from(activeDownloads.keys()));

    // Start download process
    startDownload(downloadId, url, videoFormatId, audioFormatId, type, tempDir);

  console.log('Returning download ID to frontend:', downloadId);
  const res = NextResponse.json({ downloadId });
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  return res;
  } catch (error) {
    console.error('Error starting download:', error);
    return NextResponse.json({ error: 'Failed to start download' }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const downloadId = searchParams.get('id');

    if (!downloadId) {
      return NextResponse.json({ error: 'Download ID is required' }, { status: 400 });
    }

    const downloadState = activeDownloads.get(downloadId);
    if (!downloadState) {
      return NextResponse.json({ error: 'Download not found' }, { status: 404 });
    }

  const res = NextResponse.json(downloadState);
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  return res;
  } catch (error) {
    console.error('Error getting download progress:', error);
    return NextResponse.json({ error: 'Failed to get download progress' }, { status: 500 });
  }
}

async function startDownload(downloadId, url, videoFormatId, audioFormatId, type, tempDir) {
  const downloadState = activeDownloads.get(downloadId);
  
    console.log('startDownload called with:', {
      downloadId,
      videoFormatId,
      audioFormatId,
      type
    });
    
    if (!downloadState) {
      console.error('Download state not found for ID:', downloadId);
      throw new Error('Download state not found');
    }  try {
    if (type === 'video+audio' && videoFormatId && audioFormatId) {
      console.log('Using manual download and merge approach to avoid postprocessing errors');
      // Download video and audio separately, then merge with FFmpeg
      await downloadVideoAndAudio(downloadId, url, videoFormatId, audioFormatId, tempDir);
    } else if (type === 'audio') {
      // Download audio only - use simple approach to avoid postprocessing
      await downloadAudioOnly(downloadId, url, audioFormatId, tempDir);
    } else if (type === 'video') {
      // Download video only
      await downloadVideoOnly(downloadId, url, videoFormatId, tempDir);
    } else {
      // Download best quality automatically
      await downloadBestQuality(downloadId, url, tempDir);
    }
  } catch (error) {
    console.error('Download error:', error);
    downloadState.status = 'error';
    downloadState.error = error.message;
  }
}

async function downloadVideoAndAudio(downloadId, url, videoFormatId, audioFormatId, tempDir) {
  const downloadState = activeDownloads.get(downloadId);
  
  downloadState.status = 'downloading';
  downloadState.currentFile = 'Starting video+audio download...';

  // Use yt-dlp's built-in merging similar to your Electron app
  // This avoids the FFmpeg path issues and is more reliable
  const args = [
    '--no-playlist',
    '--format', `${videoFormatId}+${audioFormatId}/best[height<=1080]`,
    '--merge-output-format', 'mp4',
    '--output', path.join(tempDir, '%(title)s.%(ext)s'),
    '--newline',
    '--no-warnings',
    '--ignore-config',
    '--embed-metadata',
    url
  ];

  // Add ffmpeg location if available
  if (resolvedFfmpegPath) {
    args.splice(-1, 0, '--ffmpeg-location', resolvedFfmpegPath);
  }

  console.log('Video+Audio download command:', 'yt-dlp', args.join(' '));

  return new Promise((resolve, reject) => {
    const ytDlp = spawn('yt-dlp', args, {
      cwd: tempDir,
      env: process.env
    });

    let outputFilename = null;
    let errorOutput = '';

    ytDlp.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('yt-dlp stdout:', output);

      // Parse progress information
      const lines = output.split('\n');
      for (const line of lines) {
        // Look for download progress
        const progressMatch = line.match(/\[download\]\s+(\d+\.?\d*)%\s+of\s+([^\s]+)\s+at\s+([^\s]+)\s+ETA\s+([^\s]+)/);
        if (progressMatch) {
          const [, progress, size, speed, eta] = progressMatch;
          downloadState.progress = Math.round(parseFloat(progress));
          downloadState.speed = speed;
          downloadState.eta = eta;
          downloadState.totalBytes = parseSize(size);
        }

        // Look for merging progress
        if (line.includes('[Merger]') || line.includes('Merging formats')) {
          downloadState.currentFile = 'Merging video and audio...';
          downloadState.progress = 95;
        }

        // Look for destination filename
        const destMatch = line.match(/\[download\]\s+Destination:\s+(.+)/);
        if (destMatch) {
          outputFilename = destMatch[1].trim();
        }

        // Look for already downloaded
        const alreadyMatch = line.match(/\[download\]\s+(.+)\s+has already been downloaded/);
        if (alreadyMatch) {
          outputFilename = alreadyMatch[1].trim();
        }

        // Look for final merged file
        const mergeDestMatch = line.match(/\[Merger\]\s+Merging formats into "(.+)"/);
        if (mergeDestMatch) {
          outputFilename = mergeDestMatch[1].trim();
        }
      }
    });

    ytDlp.stderr.on('data', (data) => {
      const error = data.toString();
      errorOutput += error;
      console.error('yt-dlp stderr:', error);
    });

    ytDlp.on('close', (code) => {
      console.log('Video+Audio download process closed with code:', code);
      
      if (code === 0) {
        // Find the actual output file
        const findOutputFile = async () => {
          try {
            const files = await fs.readdir(tempDir);
            console.log('Files in temp dir after merge:', files);
            
            // Look for mp4 files (merged output)
            const mp4Files = files.filter(file => file.endsWith('.mp4'));
            
            if (mp4Files.length > 0) {
              const fullPath = path.join(tempDir, mp4Files[0]);
              console.log('Found merged file:', fullPath);
              
              // Mark as completed
              downloadState.status = 'completed';
              downloadState.progress = 100;
              downloadState.filename = mp4Files[0];
              downloadState.tempFilePath = fullPath;
              downloadState.readyForSave = true;
              downloadState.currentFile = 'Download completed - Ready to save';
              
              console.log('Video+Audio merge completed:', {
                filename: downloadState.filename,
                tempFilePath: downloadState.tempFilePath
              });
              console.log('Marking readyForSave for ID', downloadId, '->', downloadState.readyForSave);
              
              resolve(fullPath);
            } else if (outputFilename) {
              // Fallback to outputFilename if detected
              downloadState.status = 'completed';
              downloadState.progress = 100;
              downloadState.filename = path.basename(outputFilename);
              downloadState.tempFilePath = outputFilename;
              downloadState.readyForSave = true;
              downloadState.currentFile = 'Download completed - Ready to save';
              
              console.log('Video+Audio merge completed (fallback):', {
                filename: downloadState.filename,
                tempFilePath: downloadState.tempFilePath
              });
              console.log('Marking readyForSave for ID', downloadId, '->', downloadState.readyForSave);
              
              resolve(outputFilename);
            } else {
              reject(new Error('No merged file found after download'));
            }
          } catch (err) {
            reject(err);
          }
        };
        
        findOutputFile();
      } else {
        downloadState.status = 'error';
        downloadState.error = `Video+Audio download failed: ${errorOutput || 'Unknown error'}`;
        console.error('Video+Audio download failed with code:', code);
        console.error('Error output:', errorOutput);
        reject(new Error(downloadState.error));
      }
    });

    ytDlp.on('error', (error) => {
      console.error('Video+Audio download spawn error:', error);
      downloadState.status = 'error';
      downloadState.error = error.message;
      reject(error);
    });
  });
}

async function downloadSingleFormat(downloadId, url, formatId, tempDir, type) {
  return new Promise((resolve, reject) => {
    const downloadState = activeDownloads.get(downloadId);
    
    // Use simple format selection without any postprocessing
    const args = [
      '--no-playlist',
      '--format', formatId,
      '--output', path.join(tempDir, `${type}_%(title)s.%(ext)s`),
      '--newline',
      '--no-warnings',
      '--ignore-config',
      url
    ];

    console.log(`${type.charAt(0).toUpperCase() + type.slice(1)} download command:`, 'yt-dlp', args.join(' '));

    const ytDlp = spawn('yt-dlp', args, {
      cwd: tempDir,
      env: process.env
    });

    let outputFilename = null;

    ytDlp.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('yt-dlp stdout:', output);

      // Parse progress information
      const lines = output.split('\n');
      for (const line of lines) {
        // Look for download progress
        const progressMatch = line.match(/\[download\]\s+(\d+\.?\d*)%\s+of\s+([^\s]+)\s+at\s+([^\s]+)\s+ETA\s+([^\s]+)/);
        if (progressMatch) {
          const [, progress, size, speed, eta] = progressMatch;
          let adjustedProgress = parseFloat(progress);
          
          // Adjust progress based on type and download phase
          if (type === 'video') {
            adjustedProgress = adjustedProgress / 2; // 0-50% for video
          } else if (type === 'audio') {
            adjustedProgress = 50 + (adjustedProgress / 2); // 50-100% for audio
          }
          
          downloadState.progress = Math.round(adjustedProgress);
          downloadState.speed = speed;
          downloadState.eta = eta;
          downloadState.totalBytes = parseSize(size);
        }

        // Look for destination filename
        const destMatch = line.match(/\[download\]\s+Destination:\s+(.+)/);
        if (destMatch) {
          outputFilename = destMatch[1].trim();
        }

        // Look for already downloaded
        const alreadyMatch = line.match(/\[download\]\s+(.+)\s+has already been downloaded/);
        if (alreadyMatch) {
          outputFilename = alreadyMatch[1].trim();
        }
      }
    });

    ytDlp.stderr.on('data', (data) => {
      const error = data.toString();
      console.error('yt-dlp stderr:', error);
      
      // Don't fail on warnings, only on actual errors
      if (error.includes('ERROR:')) {
        downloadState.error = error;
      }
    });

    ytDlp.on('close', (code) => {
      console.log(`${type} download process closed with code:`, code);
      
      if (code === 0 && outputFilename) {
        resolve(outputFilename);
      } else {
        reject(new Error(`${type} download failed with code ${code}: ${downloadState.error || 'Unknown error'}`));
      }
    });

    ytDlp.on('error', (error) => {
      console.error(`${type} download spawn error:`, error);
      reject(error);
    });
  });
}

async function downloadAudioOnly(downloadId, url, audioFormatId, tempDir) {
  const downloadState = activeDownloads.get(downloadId);
  
  downloadState.status = 'downloading';
  downloadState.currentFile = 'Downloading audio...';

  // Use simple download with audio extraction like your Electron app
  const audioFile = await downloadSimpleAudio(downloadId, url, audioFormatId, tempDir);
  
  if (!audioFile) {
    throw new Error('Failed to download audio');
  }

  // Keep file in temp directory and mark as ready for user to save
  downloadState.status = 'completed';
  downloadState.progress = 100;
  downloadState.filename = path.basename(audioFile);
  downloadState.tempFilePath = audioFile;
  downloadState.readyForSave = true;
  downloadState.currentFile = 'Download completed - Ready to save';
  
  console.log('Audio download completed:', {
    audioFile,
    filename: downloadState.filename,
    tempFilePath: downloadState.tempFilePath
  });
  console.log('Marking readyForSave for ID', downloadId, '->', downloadState.readyForSave);
}

// async function downloadSimpleAudio(downloadId, url, audioFormatId, tempDir) {
//   return new Promise((resolve, reject) => {
//     const downloadState = activeDownloads.get(downloadId);
    
//     // Handle null/undefined audioFormatId like your Electron app
//     const format = audioFormatId || 'bestaudio[ext=m4a]/bestaudio';
    
//     console.log('Audio download with format:', format);
    
//     // Use approach similar to your Electron app - let yt-dlp handle the conversion
//     const args = [
//       '--no-playlist',
//       '--no-warnings',
//       '-x',  // Extract audio
//       '--audio-format', 'mp3',  // Force mp3 format for consistency
//       '--audio-quality', '0',   // Best quality
//       '--output', path.join(tempDir, '%(title)s.%(ext)s'),
//       '--ignore-config',
//       '--embed-metadata',
//       '--format', format,
//       url
//     ];

//     // Add ffmpeg location if available
//     if (resolvedFfmpegPath) {
//       args.splice(-1, 0, '--ffmpeg-location', resolvedFfmpegPath);
//     }

//     console.log('Audio download command:', 'yt-dlp', args.join(' '));

//     const ytDlp = spawn('yt-dlp', args, {
//       cwd: tempDir,
//       env: process.env
//     });

//     let outputFilename = null;
//     let errorOutput = '';

//     ytDlp.stdout.on('data', (data) => {
//       const output = data.toString();
//       console.log('yt-dlp stdout:', output);

//       // Parse progress information
//       const lines = output.split('\n');
//       for (const line of lines) {
//         // Look for download progress
//         const progressMatch = line.match(/\[download\]\s+(\d+\.?\d*)%\s+of\s+([^\s]+)\s+at\s+([^\s]+)\s+ETA\s+([^\s]+)/);
//         if (progressMatch) {
//           const [, progress, size, speed, eta] = progressMatch;
//           downloadState.progress = Math.round(parseFloat(progress));
//           downloadState.speed = speed;
//           downloadState.eta = eta;
//           downloadState.totalBytes = parseSize(size);
//         }

//         // Look for audio conversion progress
//         if (line.includes('[ExtractAudio]') || line.includes('Converting')) {
//           downloadState.currentFile = 'Converting to audio format...';
//           downloadState.progress = 90;
//         }

//         // Look for destination filename
//         const destMatch = line.match(/\[download\]\s+Destination:\s+(.+)/);
//         if (destMatch) {
//           outputFilename = destMatch[1].trim();
//         }

//         // Look for already downloaded
//         const alreadyMatch = line.match(/\[download\]\s+(.+)\s+has already been downloaded/);
//         if (alreadyMatch) {
//           outputFilename = alreadyMatch[1].trim();
//         }

//         // Look for final audio file
//         const audioDestMatch = line.match(/\[ExtractAudio\]\s+Destination:\s+(.+)/);
//         if (audioDestMatch) {
//           outputFilename = audioDestMatch[1].trim();
//         }
//       }
//     });

//     ytDlp.stderr.on('data', (data) => {
//       const error = data.toString();
//       errorOutput += error;
//       console.error('yt-dlp stderr:', error);
//     });

//     ytDlp.on('close', (code) => {
//       console.log('Audio download process closed with code:', code);
      
//       if (code === 0) {
//         // Find the actual output file
//         const findOutputFile = async () => {
//           try {
//             const files = await fs.readdir(tempDir);
//             console.log('Files in temp dir after audio download:', files);
            
//             // Look for audio files (mp3, m4a, etc.)
//             const audioFiles = files.filter(file => 
//               /\.(mp3|m4a|webm|opus|wav)$/i.test(file) && !file.startsWith('audio_')
//             );
            
//             if (audioFiles.length > 0) {
//               const fullPath = path.join(tempDir, audioFiles[0]);
//               console.log('Found audio file:', fullPath);
//               resolve(fullPath);
//             } else if (outputFilename) {
//               console.log('Using detected filename:', outputFilename);
//               resolve(outputFilename);
//             } else {
//               reject(new Error('No audio file found after download'));
//             }
//           } catch (err) {
//             reject(err);
//           }
//         };
        
//         findOutputFile();
//       } else {
//         console.error('Audio download failed with code:', code);
//         console.error('Error output:', errorOutput);
//         reject(new Error(`Audio download failed: ${errorOutput || 'Unknown error'}`));
//       }
//     });

//     ytDlp.on('error', (error) => {
//       console.error('Audio download spawn error:', error);
//       reject(error);
//     });
//   });
// }
async function downloadSimpleAudio(downloadId, url, audioFormatId, tempDir) {
  return new Promise((resolve, reject) => {
    const downloadState = activeDownloads.get(downloadId);
    
    // Handle null/undefined audioFormatId - use simpler format selection
    const format = audioFormatId || 'bestaudio';
    
    console.log('Audio download with format:', format);
    
    // Simplified approach - download raw audio without post-processing first
    const args = [
      '--no-playlist',
      '--no-warnings',
      '--format', format,
      '--output', path.join(tempDir, '%(title)s.%(ext)s'),
      '--ignore-config',
      '--no-post-overwrites',
      '--keep-video', // Keep original if conversion fails
      url
    ];

    console.log('Audio download command:', 'yt-dlp', args.join(' '));

    const ytDlp = spawn('yt-dlp', args, {
      cwd: tempDir,
      env: process.env
    });

    let outputFilename = null;
    let errorOutput = '';
    let downloadComplete = false;

    ytDlp.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('yt-dlp stdout:', output);

      // Parse progress information
      const lines = output.split('\n');
      for (const line of lines) {
        // Look for download progress
        const progressMatch = line.match(/\[download\]\s+(\d+\.?\d*)%\s+of\s+([^\s]+)\s+at\s+([^\s]+)\s+ETA\s+([^\s]+)/);
        if (progressMatch) {
          const [, progress, size, speed, eta] = progressMatch;
          downloadState.progress = Math.round(parseFloat(progress));
          downloadState.speed = speed;
          downloadState.eta = eta;
          downloadState.totalBytes = parseSize(size);
        }

        // Check for download completion
        if (line.includes('[download] 100%') || line.includes('has already been downloaded')) {
          downloadComplete = true;
          downloadState.progress = 100;
        }

        // Look for destination filename
        const destMatch = line.match(/\[download\]\s+Destination:\s+(.+)/);
        if (destMatch) {
          outputFilename = destMatch[1].trim();
        }

        // Look for already downloaded
        const alreadyMatch = line.match(/\[download\]\s+(.+)\s+has already been downloaded/);
        if (alreadyMatch) {
          outputFilename = alreadyMatch[1].trim();
          downloadComplete = true;
        }
      }
    });

    ytDlp.stderr.on('data', (data) => {
      const error = data.toString();
      errorOutput += error;
      console.error('yt-dlp stderr:', error);
    });

    ytDlp.on('close', (code) => {
      console.log('Audio download process closed with code:', code);
      
      if (code === 0 || (downloadComplete && outputFilename)) {
        // Find the actual output file
        const findOutputFile = async () => {
          try {
            const files = await fs.readdir(tempDir);
            console.log('Files in temp dir after audio download:', files);
            
            // Look for any media files
            const mediaFiles = files.filter(file => 
              /\.(mp3|m4a|webm|opus|wav|ogg|aac)$/i.test(file)
            );
            
            if (mediaFiles.length > 0) {
              // Sort by modification time (newest first) to get the actual download
              const fileStats = await Promise.all(
                mediaFiles.map(async (file) => ({
                  file,
                  path: path.join(tempDir, file),
                  stat: await fs.stat(path.join(tempDir, file))
                }))
              );
              
              fileStats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
              const chosenFile = fileStats[0].path;
              
              console.log('Found audio file:', chosenFile);
              
              // If it's not already mp3, convert it using a separate process
              if (!chosenFile.endsWith('.mp3')) {
                console.log('Converting to MP3...');
                downloadState.currentFile = 'Converting to MP3...';
                
                try {
                  const convertedFile = await convertToMp3(chosenFile, tempDir);
                  resolve(convertedFile);
                } catch (convertError) {
                  console.log('Conversion failed, using original file:', convertError.message);
                  resolve(chosenFile); // Use original if conversion fails
                }
              } else {
                resolve(chosenFile);
              }
              
            } else if (outputFilename && await fs.access(outputFilename).then(() => true).catch(() => false)) {
              console.log('Using detected filename:', outputFilename);
              resolve(outputFilename);
            } else {
              reject(new Error('No audio file found after download'));
            }
          } catch (err) {
            reject(err);
          }
        };
        
        findOutputFile();
      } else {
        console.error('Audio download failed with code:', code);
        console.error('Error output:', errorOutput);
        reject(new Error(`Audio download failed: ${errorOutput || 'Unknown error'}`));
      }
    });

    ytDlp.on('error', (error) => {
      console.error('Audio download spawn error:', error);
      reject(error);
    });
  });
}

// Helper function to convert audio to MP3 using ffmpeg directly
async function convertToMp3(inputFile, outputDir) {
  return new Promise((resolve, reject) => {
    const inputBasename = path.basename(inputFile, path.extname(inputFile));
    const outputFile = path.join(outputDir, `${inputBasename}.mp3`);
    
    if (!resolvedFfmpegPath) {
      throw new Error('FFmpeg not available for conversion');
    }
    
    const args = [
      '-i', inputFile,
      '-acodec', 'libmp3lame',
      '-ab', '192k',
      '-ar', '44100',
      '-y', // Overwrite output file
      outputFile
    ];
    
    console.log('FFmpeg conversion command:', resolvedFfmpegPath, args.join(' '));
    
    const ffmpeg = spawn(resolvedFfmpegPath, args);
    
    ffmpeg.stdout.on('data', (data) => {
      console.log('FFmpeg stdout:', data.toString());
    });
    
    ffmpeg.stderr.on('data', (data) => {
      console.log('FFmpeg stderr:', data.toString());
    });
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        console.log('Audio conversion completed:', outputFile);
        resolve(outputFile);
      } else {
        reject(new Error(`FFmpeg conversion failed with code ${code}`));
      }
    });
    
    ffmpeg.on('error', (error) => {
      reject(error);
    });
  });
}
async function downloadVideoOnly(downloadId, url, videoFormatId, tempDir) {
  const downloadState = activeDownloads.get(downloadId);
  
  downloadState.status = 'downloading';
  downloadState.currentFile = 'Downloading video...';

  const videoFile = await downloadSingleFormat(downloadId, url, videoFormatId, tempDir, 'video');
  
  if (!videoFile) {
    throw new Error('Failed to download video');
  }

  // Keep file in temp directory and mark as ready for user to save
  downloadState.status = 'completed';
  downloadState.progress = 100;
  downloadState.filename = path.basename(videoFile);
  downloadState.tempFilePath = videoFile;
  downloadState.readyForSave = true;
  downloadState.currentFile = 'Download completed - Ready to save';
  
  console.log('Video download completed:', {
    videoFile,
    filename: downloadState.filename,
    tempFilePath: downloadState.tempFilePath
  });
  console.log('Marking readyForSave for ID', downloadId, '->', downloadState.readyForSave);
}

async function downloadBestQuality(downloadId, url, tempDir) {
  return new Promise((resolve, reject) => {
    const downloadState = activeDownloads.get(downloadId);
    
    downloadState.status = 'downloading';
    downloadState.currentFile = 'Downloading...';

    const args = [
      '--no-playlist',
      '--format', 'best',
      '--output', path.join(tempDir, '%(title)s.%(ext)s'),
      '--newline',
      '--no-warnings',
      url
    ];

    console.log('yt-dlp command:', 'yt-dlp', args.join(' '));

    const ytDlp = spawn('yt-dlp', args, {
      cwd: tempDir,
      env: process.env
    });

    let outputFilename = null;

    ytDlp.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('yt-dlp stdout:', output);

      // Parse progress information
      const lines = output.split('\n');
      for (const line of lines) {
        // Look for download progress
        const progressMatch = line.match(/\[download\]\s+(\d+\.?\d*)%\s+of\s+([^\s]+)\s+at\s+([^\s]+)\s+ETA\s+([^\s]+)/);
        if (progressMatch) {
          const [, progress, size, speed, eta] = progressMatch;
          downloadState.progress = Math.round(parseFloat(progress));
          downloadState.speed = speed;
          downloadState.eta = eta;
          downloadState.totalBytes = parseSize(size);
        }

        // Look for destination filename
        const destMatch = line.match(/\[download\]\s+Destination:\s+(.+)/);
        if (destMatch) {
          outputFilename = destMatch[1].trim();
        }

        // Look for already downloaded
        const alreadyMatch = line.match(/\[download\]\s+(.+)\s+has already been downloaded/);
        if (alreadyMatch) {
          outputFilename = alreadyMatch[1].trim();
        }
      }
    });

    ytDlp.stderr.on('data', (data) => {
      const error = data.toString();
      console.error('yt-dlp stderr:', error);
      
      if (error.includes('ERROR:')) {
        downloadState.error = error;
      }
    });

    ytDlp.on('close', (code) => {
      console.log('yt-dlp process closed with code:', code);
      
      if (code === 0 && outputFilename) {
        // Keep file in temp directory and mark as ready for user to save
        downloadState.status = 'completed';
        downloadState.progress = 100;
        downloadState.filename = path.basename(outputFilename);
        downloadState.tempFilePath = outputFilename;
        downloadState.readyForSave = true;
        downloadState.currentFile = 'Download completed - Ready to save';
        console.log('Best quality download completed:', {
          filename: downloadState.filename,
          tempFilePath: downloadState.tempFilePath
        });
        console.log('Marking readyForSave for ID', downloadId, '->', downloadState.readyForSave);
        resolve();
      } else {
        downloadState.status = 'error';
        downloadState.error = downloadState.error || `yt-dlp failed with code ${code}`;
        reject(new Error(downloadState.error));
      }
    });

    ytDlp.on('error', (error) => {
      console.error('yt-dlp spawn error:', error);
      downloadState.status = 'error';
      downloadState.error = error.message;
      reject(error);
    });
  });
}

async function mergeVideoAndAudio(downloadId, videoFile, audioFile, tempDir) {
  return new Promise((resolve, reject) => {
    const downloadState = activeDownloads.get(downloadId);
    
    // Extract filename without extension from video file
    const videoBasename = path.basename(videoFile, path.extname(videoFile));
    const outputFile = path.join(tempDir, `${videoBasename}_merged.mp4`);

    console.log('Merging files:', { videoFile, audioFile, outputFile });
    console.log('Current FFmpeg path:', ffmpeg().options._ffmpegPath);

    // Check if FFmpeg binary exists
    const ffmpegPath = ffmpeg().options._ffmpegPath;
    if (!ffmpegPath) {
      console.error('FFmpeg path not set');
      reject(new Error('FFmpeg binary not found - path not configured'));
      return;
    }

    // Use FFmpeg to merge video and audio
    const ffmpegProcess = ffmpeg()
      .input(videoFile)
      .input(audioFile)
      .outputOptions([
        '-c:v copy',  // Copy video stream without re-encoding
        '-c:a aac',   // Encode audio to AAC
        '-strict experimental'
      ])
      .output(outputFile)
      .on('start', (commandLine) => {
        console.log('FFmpeg command:', commandLine);
        console.log('FFmpeg binary being used:', ffmpegPath);
      })
      .on('progress', (progress) => {
        console.log('FFmpeg progress:', progress);
        if (progress.percent) {
          downloadState.progress = Math.round(80 + (progress.percent / 5)); // 80-100% for merging
        }
      })
      .on('end', () => {
        console.log('FFmpeg merge completed');
        resolve(outputFile);
      })
      .on('error', (error) => {
        console.error('FFmpeg merge error:', error);
        console.error('FFmpeg binary path was:', ffmpegPath);
        console.error('Working directory:', process.cwd());
        console.error('Error details:', {
          code: error.code,
          errno: error.errno,
          syscall: error.syscall,
          path: error.path
        });
        reject(error);
      });

    try {
      ffmpegProcess.run();
    } catch (runError) {
      console.error('Error starting FFmpeg process:', runError);
      reject(runError);
    }
  });
}

function parseSize(sizeStr) {
  if (!sizeStr) return 0;
  
  const units = {
    'B': 1,
    'KB': 1024,
    'MB': 1024 * 1024,
    'GB': 1024 * 1024 * 1024,
    'KiB': 1024,
    'MiB': 1024 * 1024,
    'GiB': 1024 * 1024 * 1024
  };
  
  const match = sizeStr.match(/^([\d.]+)\s*([A-Za-z]+)$/);
  if (match) {
    const [, size, unit] = match;
    const multiplier = units[unit] || 1;
    return parseFloat(size) * multiplier;
  }
  
  return 0;
}

// Cleanup function to remove old downloads
setInterval(() => {
  const now = Date.now();
  const maxAge = 60 * 60 * 1000; // 1 hour
  
  for (const [downloadId, downloadState] of activeDownloads.entries()) {
    if (now - parseInt(downloadId) > maxAge) {
      // Clean up temp directory
      if (downloadState.tempDir) {
        fs.rmdir(downloadState.tempDir, { recursive: true }).catch(() => {});
      }
      activeDownloads.delete(downloadId);
    }
  }
}, 10 * 60 * 1000); // Check every 10 minutes