import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { activeDownloads } from '../download-progress/route.js';

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

    if (!downloadState.readyForSave || !downloadState.tempFilePath) {
      return NextResponse.json({ error: 'File not ready for saving' }, { status: 400 });
    }

    // Check if file exists
    try {
      await fs.access(downloadState.tempFilePath);
    } catch (error) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Read file and serve it
    const fileBuffer = await fs.readFile(downloadState.tempFilePath);
    const filename = downloadState.filename;

    // Determine content type based on file extension
    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    
    if (ext === '.mp4') {
      contentType = 'video/mp4';
    } else if (ext === '.mp3') {
      contentType = 'audio/mpeg';
    } else if (ext === '.webm') {
      contentType = 'video/webm';
    } else if (ext === '.m4a') {
      contentType = 'audio/mp4';
    }

    // Update download state
    downloadState.readyForSave = false;
    downloadState.currentFile = 'File downloaded';

    // Clean up temp file after serving
    setTimeout(async () => {
      try {
        await fs.unlink(downloadState.tempFilePath);
      } catch (error) {
        console.warn('Could not delete temp file:', error);
      }
    }, 5000); // Delete after 5 seconds

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('Error serving file:', error);
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 });
  }
}
