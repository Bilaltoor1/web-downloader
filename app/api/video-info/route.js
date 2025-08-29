import { NextResponse } from 'next/server';
import { spawn } from 'child_process';

export async function POST(request) {
  try {
    const { url } = await request.json();
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Use yt-dlp to get video information
    const videoInfo = await getVideoInfo(url);
    
    return NextResponse.json(videoInfo);
  } catch (error) {
    console.error('Error fetching video info:', error);
    return NextResponse.json(
      { error: 'Failed to fetch video information' },
      { status: 500 }
    );
  }
}

function getVideoInfo(url) {
  return new Promise((resolve, reject) => {
    const ytdlp = spawn('yt-dlp', [
      '--dump-json',
      '--no-playlist',
      '--no-check-certificate',
      url
    ]);

    let output = '';
    let errorOutput = '';

    ytdlp.stdout.on('data', (data) => {
      output += data.toString();
    });

    ytdlp.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    ytdlp.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp failed: ${errorOutput}`));
        return;
      }

      try {
        const videoData = JSON.parse(output);
        
        // Process formats to match our frontend expectations
        const processedFormats = {
          videoFormats: [],
          audioFormats: []
        };

        if (videoData.formats) {
          // Process video formats
          const videoFormats = videoData.formats.filter(f => 
            f.vcodec && f.vcodec !== 'none' && f.height
          );
          
          videoFormats.forEach(format => {
            const size = format.filesize ? `${(format.filesize / (1024 * 1024)).toFixed(1)}MB` : 'Unknown size';
            const quality = format.height ? `${format.height}p${format.fps === 60 ? '60' : ''}` : 'Unknown';
            
            processedFormats.videoFormats.push({
              id: format.format_id,
              quality,
              ext: format.ext,
              size,
              vcodec: format.vcodec,
              filesize: format.filesize,
              selected: format.height === 1080 // Default to 1080p
            });
          });

          // Process audio formats
          const audioFormats = videoData.formats.filter(f => 
            f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none')
          );
          
          audioFormats.forEach(format => {
            const size = format.filesize ? `${(format.filesize / (1024 * 1024)).toFixed(1)}MB` : 'Unknown size';
            
            processedFormats.audioFormats.push({
              id: format.format_id,
              quality: format.format_note || 'Unknown quality',
              ext: format.ext === 'webm' ? 'opus' : format.ext,
              size,
              note: format.format_note || 'Unknown quality'
            });
          });
        }

        // Sort formats by quality
        processedFormats.videoFormats.sort((a, b) => {
          const aHeight = parseInt(a.quality);
          const bHeight = parseInt(b.quality);
          return bHeight - aHeight; // Descending order
        });

        const result = {
          title: videoData.title || 'Unknown Title',
          thumbnail: videoData.thumbnail || null,
          duration: videoData.duration || 0,
          uploader: videoData.uploader || 'Unknown',
          view_count: videoData.view_count || 0,
          url: videoData.webpage_url || url,
          extractor: videoData.extractor_key || 'Unknown',
          formats: processedFormats
        };

        resolve(result);
      } catch (parseError) {
        reject(new Error(`Failed to parse video info: ${parseError.message}`));
      }
    });

    ytdlp.on('error', (error) => {
      reject(new Error(`Failed to spawn yt-dlp: ${error.message}`));
    });
  });
}
