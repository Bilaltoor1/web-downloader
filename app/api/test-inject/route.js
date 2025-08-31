import { NextResponse } from 'next/server';
import { activeDownloads } from '../../shared-state.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    console.log('Test endpoint called - injecting download state');
    
    const downloadId = '1756623194916';
    
    // Manually inject the download state that would cause the Unicode filename issue
    const testState = {
      status: 'completed',
      tempFilePath: 'C:\\Users\\BILALT~1\\AppData\\Local\\Temp\\ytdownloader\\1756623194916\\video_Extremely High Flood Alert Issued  ARY News 9 AM Headlines  31st Aug 2025.mp4', // Note: regular spaces, not Unicode
      filename: 'video_Extremely High Flood Alert Issued  ARY News 9 AM Headlines  31st Aug 2025.mp4', // Note: regular spaces, not Unicode
      readyForSave: true
    };
    
    activeDownloads.set(downloadId, testState);
    
    console.log('Injected test state for download ID:', downloadId);
    console.log('Active downloads now has:', activeDownloads.size, 'entries');
    
    return NextResponse.json({ 
      success: true, 
      downloadId,
      message: 'Test state injected. Now try: /api/download-file?id=' + downloadId
    });
    
  } catch (error) {
    console.error('Test injection error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
