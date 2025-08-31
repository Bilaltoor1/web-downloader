import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { activeDownloads } from '../shared-state';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Function to sanitize filename for HTTP headers (ASCII fallback)
function sanitizeFilename(filename) {
  if (!filename) return 'download';
  return String(filename)
    .replace(/｜/g, '|')
    .replace(/[^\x00-\x7F]/g, '_')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'download';
}

// RFC 5987 encoder for UTF-8 filenames in HTTP headers
function encodeRFC5987(str) {
  return encodeURIComponent(str)
    .replace(/['()]/g, escape) // i.e., %27 %28 %29
    .replace(/\*/g, '%2A')
    .replace(/%(7C|60|5E)/g, (match, hex) => `%${hex.toUpperCase()}`);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const downloadId = searchParams.get('id');
    
    console.log('Download-file request for ID:', downloadId);
    console.log('Active downloads size:', activeDownloads.size);
    console.log('Active downloads keys:', Array.from(activeDownloads.keys()));
    console.log('Current timestamp:', Date.now());
    console.log('Download ID timestamp:', parseInt(downloadId));
    console.log('Time difference:', Date.now() - parseInt(downloadId), 'ms');
    
    if (!downloadId) {
      const res = NextResponse.json({ error: 'Download ID is required' }, { status: 400 });
      res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      return res;
    }

    // Get download state from activeDownloads
    let downloadState = activeDownloads.get(downloadId);
    console.log('Download state found:', !!downloadState);

    // Fallback: if state is missing (e.g., HMR/module isolation), try to
    // locate the temp dir by ID and discover the file to serve.
    if (!downloadState) {
      console.log('Attempting fallback discovery for ID:', downloadId);
      const tempDir = path.join(os.tmpdir(), 'ytdownloader', downloadId);
      try {
        const entries = await fs.readdir(tempDir);
        console.log('Fallback dir entries:', entries);
        // Prefer merged mp4, then mp3 audio, then video files, then others
        const candidates = entries
          .filter((f) => /\.(mp4|webm|m4a|mp3|wav|opus)$/i.test(f))
          .map((f) => ({ 
            file: f, 
            preferred: /\.mp4$/i.test(f) && !f.startsWith('video_') ? 4 :  // Merged mp4
                      /\.mp3$/i.test(f) ? 3 :                               // Audio mp3
                      /^video_/.test(f) ? 2 :                               // Video files
                      /^audio_/.test(f) ? 1 : 0                             // Other audio files
          }));

        if (candidates.length > 0) {
          // Sort by preference (merged mp4 > mp3 audio > video_ > audio_ > others)
          candidates.sort((a, b) => b.preferred - a.preferred);
          let chosen = candidates[0].file;
          
          // If same preference, choose most recently modified
          if (candidates.length > 1 && candidates[0].preferred === candidates[1].preferred) {
            const samePreference = candidates.filter(c => c.preferred === candidates[0].preferred);
            const statsList = await Promise.all(
              samePreference.map(async (c) => ({ c, stat: await fs.stat(path.join(tempDir, c.file)) }))
            );
            statsList.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
            chosen = statsList[0].c.file;
          }
          
          const discoveredPath = path.join(tempDir, chosen);
          console.log('Fallback discovered file:', discoveredPath);
          
          // Use the filename as-is (no more prefixes to remove)
          downloadState = {
            id: downloadId,
            status: 'completed',
            tempFilePath: discoveredPath,
            filename: chosen,
            readyForSave: true,
          };
        }
      } catch (e) {
        console.log('Fallback discovery failed:', e?.message);
      }

      if (!downloadState) {
        console.log('Available download IDs:', Array.from(activeDownloads.keys()));
        const res = NextResponse.json({ error: 'Download not found' }, { status: 404 });
        res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        return res;
      }
    }

    console.log('Download state:', {
      status: downloadState.status,
      tempFilePath: downloadState.tempFilePath,
      filename: downloadState.filename,
      readyForSave: downloadState.readyForSave
    });

    if (!downloadState.tempFilePath) {
      console.log('File not ready - tempFilePath is null/undefined');
      const res = NextResponse.json({ error: 'File not ready' }, { status: 404 });
      res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      return res;
    }

    if (!downloadState.readyForSave) {
      console.log('File not ready for save - readyForSave is false');
      const res = NextResponse.json({ error: 'File not ready for saving' }, { status: 400 });
      res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      return res;
    }

    // Check if file exists; if missing, scan temp directory for a suitable file
    try {
      await fs.access(downloadState.tempFilePath);
      console.log('File access successful');
    } catch (error) {
      console.warn('Primary file access failed, attempting directory scan:', error?.message || error);
      try {
        const dir = path.dirname(downloadState.tempFilePath);
        const entries = await fs.readdir(dir);
        const mediaFiles = entries.filter(f => /\.(mp4|webm|m4a|mp3|wav|opus|ogg|aac)$/i.test(f));
        if (mediaFiles.length > 0) {
          const statsList = await Promise.all(
            mediaFiles.map(async (f) => ({ f, stat: await fs.stat(path.join(dir, f)) }))
          );
          statsList.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
          const chosen = statsList[0].f;
          downloadState.tempFilePath = path.join(dir, chosen);
          downloadState.filename = chosen;
          await fs.access(downloadState.tempFilePath);
          console.log('Recovered file via scan:', downloadState.tempFilePath);
        } else {
          const res = NextResponse.json({ error: 'File not found' }, { status: 404 });
          res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
          return res;
        }
      } catch (scanErr) {
        console.error('Directory scan failed:', scanErr);
        const res = NextResponse.json({ error: 'File not found' }, { status: 404 });
        res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        return res;
      }
    }

    // Get file stats and read file
    console.log('Getting file stats for:', downloadState.tempFilePath);
    const stats = await fs.stat(downloadState.tempFilePath);
    console.log('File stats:', { size: stats.size, mtime: stats.mtime });
    
    console.log('Reading file buffer...');
    const fileBuffer = await fs.readFile(downloadState.tempFilePath);
    console.log('File buffer read successfully, size:', fileBuffer.length);
    
    // Determine content type based on file extension
    const ext = path.extname(downloadState.tempFilePath).toLowerCase();
    let contentType = 'application/octet-stream';
    
    switch (ext) {
      case '.mp4':
        contentType = 'video/mp4';
        break;
      case '.webm':
        contentType = 'video/webm';
        break;
      case '.mp3':
        contentType = 'audio/mpeg';
        break;
      case '.m4a':
        contentType = 'audio/mp4';
        break;
      case '.wav':
        contentType = 'audio/wav';
        break;
      case '.opus':
        contentType = 'audio/opus';
        break;
    }
    
    // Use the filename from download state
    const downloadFilename = downloadState.filename || `download_${downloadId}${ext}`;
    
    console.log('Serving download file:', {
      filePath: downloadState.tempFilePath,
      filename: downloadFilename,
      contentType,
      size: stats.size
    });

    // Clean up temp file after serving (increased timeout for large files)
        setTimeout(async () => {
          try {
            // Use rm with force to avoid failing if the file was already deleted/moved
            await fs.rm(downloadState.tempFilePath, { force: true });
            console.log('Cleaned up temp file (if existed):', downloadState.tempFilePath);
          } catch (error) {
            console.warn('Cleanup encountered an error (ignored):', error?.message || error);
          } finally {
            // Also remove from activeDownloads to free memory
            activeDownloads.delete(downloadId);
            console.log('Removed download state for ID:', downloadId);
          }
        }, 10000); // Delete after 10 seconds to allow for slow downloads
    
    // Create response with file
    const response = new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': stats.size.toString(),
          // Provide both a sanitized ASCII fallback and RFC5987 UTF-8 filename
          'Content-Disposition': `attachment; filename="${sanitizeFilename(downloadFilename)}"; filename*=UTF-8''${encodeRFC5987(downloadFilename)}`,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
      }
    });
    
    return response;
    
  } catch (error) {
    console.error('Download file error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      downloadId: request?.url?.includes('id=') ? new URL(request.url).searchParams.get('id') : 'unknown'
    });
    const res = NextResponse.json({ 
      error: 'Failed to download file',
      details: error.message 
    }, { status: 500 });
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res;
  }
}