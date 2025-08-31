import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
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
    const { url } = await request.json();
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    // Validate URL format - be more lenient and let yt-dlp handle validation
    const cleanUrl = url.trim();
    if (!cleanUrl || cleanUrl.length < 3) {
      return NextResponse.json({ error: 'Invalid URL or video ID' }, { status: 400 });
    }

    // Use yt-dlp to get video information
    const videoInfo = await getVideoInfo(cleanUrl);
    
    return NextResponse.json(videoInfo);
  } catch (error) {
    console.error('Error fetching video info:', error);
    return NextResponse.json(
      { error: 'Failed to fetch video information: ' + error.message },
      { status: 500 }
    );
  }
}

function getVideoInfo(url) {
  return new Promise((resolve, reject) => {
    const args = [
      '--dump-json',
      '--no-playlist',
      '--no-check-certificate',
      '--no-warnings',
      '--ignore-config',
      url
    ];
    const ytdlp = spawn('yt-dlp', args, { env: getSpawnEnv() });

    let output = '';
    let errorOutput = '';

    ytdlp.stdout.on('data', (data) => {
      const chunk = data.toString();
      // Filter out non-JSON output
      if (chunk.includes('{') || output.length > 0) {
        output += chunk;
      }
    });

    ytdlp.stderr.on('data', (data) => {
      const chunk = data.toString();
      // Only capture actual errors, not warnings
      if (chunk.includes('ERROR:')) {
        errorOutput += chunk;
      }
    });

    ytdlp.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp failed: ${errorOutput || 'Unknown error'}`));
        return;
      }

      try {
        // Find the JSON part of the output
        const jsonMatch = output.match(/\{.*\}/s);
        if (!jsonMatch) {
          reject(new Error('No valid JSON found in yt-dlp output'));
          return;
        }

        const videoData = JSON.parse(jsonMatch[0]);
        
        // Process formats to match our frontend expectations
        const processedFormats = {
          videoFormats: [],
          audioFormats: []
        };

        if (videoData.formats) {
          // Process video formats (with video codec and height)
          const videoFormats = videoData.formats.filter(f => 
            f.vcodec && f.vcodec !== 'none' && f.height && f.height > 0
          );
          
          videoFormats.forEach(format => {
            const size = format.filesize ? `${(format.filesize / (1024 * 1024)).toFixed(1)}MB` : 'Unknown size';
            const quality = format.height ? `${format.height}p${format.fps === 60 ? '60' : ''}` : 'Unknown';
            
            processedFormats.videoFormats.push({
              id: format.format_id,
              quality,
              ext: format.ext,
              size,
              vcodec: format.vcodec.split('.')[0], // Simplify codec name
              filesize: format.filesize,
              selected: format.height === 1080 // Default to 1080p
            });
          });

          // Process audio formats (audio only)
          const audioFormats = videoData.formats.filter(f => 
            f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none')
          );
          
          audioFormats.forEach(format => {
            const size = format.filesize ? `${(format.filesize / (1024 * 1024)).toFixed(1)}MB` : 'Unknown size';
            
            processedFormats.audioFormats.push({
              id: format.format_id,
              quality: format.format_note || format.abr ? `${format.abr}kbps` : 'Unknown quality',
              ext: format.ext === 'webm' ? 'opus' : format.ext,
              size,
              note: format.format_note || `${format.abr || 'Unknown'}kbps`
            });
          });
        }

        // Sort formats by quality
        processedFormats.videoFormats.sort((a, b) => {
          const aHeight = parseInt(a.quality);
          const bHeight = parseInt(b.quality);
          return bHeight - aHeight; // Descending order
        });

        processedFormats.audioFormats.sort((a, b) => {
          const aKbps = parseInt(a.note) || 0;
          const bKbps = parseInt(b.note) || 0;
          return bKbps - aKbps; // Descending order
        });

        const result = {
          title: videoData.title || 'Unknown Title',
          thumbnail: videoData.thumbnail || null,
          duration: videoData.duration || 0,
          uploader: videoData.uploader || 'Unknown',
          view_count: videoData.view_count || 0,
          url: videoData.webpage_url || url,
          extractor: videoData.extractor_key || 'Unknown',
          formats: processedFormats,
          // Also include raw formats for compatibility
          rawFormats: videoData.formats || []
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
