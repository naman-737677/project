import http from 'http';
import fs from 'fs';
import path from 'path';
import { handleHttpRequest } from '../src/index';

async function runTests() {
  console.log('--- Starting Audio Streaming & Voice Recording Tests ---');

  // Create temporary HTTP test server
  const server = http.createServer((req, res) => {
    handleHttpRequest(req, res);
  });

  await new Promise<void>((resolve) => server.listen(4888, resolve));
  console.log('✓ Test HTTP Server listening on port 4888');

  try {
    // 1. Upload a simulated WebM Opus audio file
    const sampleWebmBuffer = Buffer.concat([
      Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]), // EBML header
      Buffer.from('OpusHead....OpusTags....A_OPUS audio frame data here.......................', 'utf-8'),
    ]);

    const uploadRes = await fetch('http://localhost:4888/api/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileName: 'voice_test_123456.webm',
        fileType: 'audio/webm;codecs=opus',
        fileSize: sampleWebmBuffer.length,
        fileData: sampleWebmBuffer.toString('base64'),
      }),
    });

    const uploadData = await uploadRes.json();
    if (!uploadRes.ok || !uploadData.attachment) {
      throw new Error(`Upload failed: ${JSON.stringify(uploadData)}`);
    }

    const fileUrl = uploadData.attachment.file_url;
    console.log('✓ Voice WebM uploaded successfully. URL:', fileUrl);

    // 2. Fetch full file (no Range) -> verify HTTP 200 and Accept-Ranges: bytes
    const fullRes = await fetch(`http://localhost:4888${fileUrl}`);
    if (fullRes.status !== 200) {
      throw new Error(`Expected 200 OK, got ${fullRes.status}`);
    }
    const acceptRanges = fullRes.headers.get('accept-ranges');
    if (acceptRanges !== 'bytes') {
      throw new Error(`Expected Accept-Ranges: bytes, got ${acceptRanges}`);
    }
    const contentType = fullRes.headers.get('content-type');
    if (!contentType || !contentType.includes('audio/webm')) {
      throw new Error(`Expected audio/webm content-type, got ${contentType}`);
    }
    console.log('✓ Full file request passed with Accept-Ranges: bytes and Content-Type: audio/webm');

    // 3. Test HTTP Range request (e.g. Range: bytes=0-20) -> verify HTTP 206 Partial Content
    const rangeRes = await fetch(`http://localhost:4888${fileUrl}`, {
      headers: {
        Range: 'bytes=0-20',
      },
    });

    if (rangeRes.status !== 206) {
      throw new Error(`Expected 206 Partial Content, got ${rangeRes.status}`);
    }
    const contentRange = rangeRes.headers.get('content-range');
    if (!contentRange || !contentRange.startsWith('bytes 0-20/')) {
      throw new Error(`Expected Content-Range: bytes 0-20/..., got ${contentRange}`);
    }
    const rangeBuffer = Buffer.from(await rangeRes.arrayBuffer());
    if (rangeBuffer.length !== 21) {
      throw new Error(`Expected 21 bytes returned, got ${rangeBuffer.length}`);
    }
    console.log('✓ Range request (bytes=0-20) returned HTTP 206 with correct Content-Range and byte slice');

    // 4. Test HTTP Range request seeking near end (e.g. bytes=25-)
    const seekRes = await fetch(`http://localhost:4888${fileUrl}`, {
      headers: {
        Range: 'bytes=25-',
      },
    });

    if (seekRes.status !== 206) {
      throw new Error(`Expected 206 Partial Content for seek, got ${seekRes.status}`);
    }
    const seekRange = seekRes.headers.get('content-range');
    if (!seekRange || !seekRange.startsWith('bytes 25-')) {
      throw new Error(`Expected Content-Range: bytes 25-..., got ${seekRange}`);
    }
    console.log('✓ Range seek request (bytes=25-) returned HTTP 206');

    // 5. Test invalid Range (bytes=999999-) -> verify HTTP 416 Range Not Satisfiable
    const invalidRangeRes = await fetch(`http://localhost:4888${fileUrl}`, {
      headers: {
        Range: 'bytes=999999-',
      },
    });
    if (invalidRangeRes.status !== 416) {
      throw new Error(`Expected 416 Range Not Satisfiable, got ${invalidRangeRes.status}`);
    }
    console.log('✓ Invalid range request properly returned HTTP 416 Range Not Satisfiable');

    console.log('🎉 ALL AUDIO STREAMING TESTS PASSED SUCCESSFULLY! 🎉');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
