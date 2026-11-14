"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleHttpRequest = handleHttpRequest;
exports.bootstrap = bootstrap;
const http_1 = __importDefault(require("http"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const index_js_1 = require("./config/index.js");
const client_js_1 = require("./redis/client.js");
const pubsub_js_1 = require("./websocket/pubsub.js");
const server_js_1 = require("./websocket/server.js");
const prisma_js_1 = require("./db/prisma.js");
const routes_js_1 = require("./auth/routes.js");
const chatStore_js_1 = require("./db/chatStore.js");
const friendsStore_js_1 = require("./db/friendsStore.js");
const UPLOADS_DIR = path_1.default.resolve(process.cwd(), 'data', 'uploads');
if (!fs_1.default.existsSync(UPLOADS_DIR)) {
    fs_1.default.mkdirSync(UPLOADS_DIR, { recursive: true });
}
const MIME_TYPES = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.zip': 'application/zip',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.webm': 'audio/webm',
    '.weba': 'audio/webm',
    '.opus': 'audio/opus',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
};
async function handleHttpRequest(req, res) {
    // Enable CORS for frontend requests including Range requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range, X-File-Name');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }
    const url = req.url || '';
    const host = req.headers.host || 'localhost';
    const parsedUrl = new URL(url, `http://${host}`);
    const pathname = parsedUrl.pathname;
    // Delegate to 2FA and credential auth handler
    const handledAuth = await (0, routes_js_1.handleAuthRoute)(req, res, pathname);
    if (handledAuth)
        return;
    // Health check endpoint
    if ((pathname === '/health' || pathname.startsWith('/health/')) && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
        return;
    }
    // Auth Token Generation endpoint (for web/mobile clients)
    if ((pathname === '/api/auth/token' || pathname === '/auth/token') && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk;
        });
        req.on('end', async () => {
            try {
                const parsed = JSON.parse(body || '{}');
                const userId = parsed.userId || '11111111-1111-4111-8111-111111111111';
                const username = parsed.username || 'alice';
                const deviceId = parsed.deviceId || 'browser-' + Math.random().toString(36).substring(2, 7);
                const token = jsonwebtoken_1.default.sign({ userId, username, deviceId }, index_js_1.config.jwtSecret, { expiresIn: index_js_1.config.jwtExpiresIn });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    token,
                    user: { userId, username, deviceId },
                }));
            }
            catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON request: ' + err.message }));
            }
        });
        return;
    }
    // Create / Join Room Endpoint
    if ((pathname === '/api/chats' || pathname === '/api/chats/create') && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk;
        });
        req.on('end', async () => {
            try {
                const parsed = JSON.parse(body || '{}');
                const chatId = parsed.id || crypto_1.default.randomUUID();
                const title = parsed.title || 'New Conversation';
                const type = parsed.type || 'GROUP';
                const userId = parsed.userId;
                const chat = await (0, chatStore_js_1.ensureChatExists)(chatId, title, type);
                if (userId) {
                    await (0, chatStore_js_1.checkParticipant)(chatId, userId);
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'success', chat }));
            }
            catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }
    // GET /api/chats - Get all previous chats for the user
    if (pathname === '/api/chats' && req.method === 'GET') {
        try {
            let userId = parsedUrl.searchParams.get('userId');
            if (!userId) {
                const authHeader = req.headers.authorization;
                if (authHeader?.startsWith('Bearer ')) {
                    const decoded = jsonwebtoken_1.default.decode(authHeader.slice(7));
                    userId = decoded?.userId;
                }
            }
            const chats = (0, chatStore_js_1.getAllChatsForUser)(userId || '11111111-1111-4111-8111-111111111111');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'success', chats }));
        }
        catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }
    // GET /api/chats/:chatId/messages - Get previous messages for a chat
    if (pathname.startsWith('/api/chats/') && pathname.endsWith('/messages') && req.method === 'GET') {
        try {
            const parts = pathname.split('/');
            // pathname is /api/chats/<chatId>/messages
            const chatId = parts[3];
            const limitParam = parsedUrl.searchParams.get('limit');
            const beforeSeq = parsedUrl.searchParams.get('beforeSeq') || undefined;
            const limit = limitParam ? parseInt(limitParam, 10) : 50;
            const result = (0, chatStore_js_1.getAllMessagesForChat)(chatId, limit, beforeSeq);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'success',
                chatId,
                messages: result.messages,
                hasMore: result.hasMore,
            }));
        }
        catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }
    // ----------------------------------------------------
    // Friends & Direct Messaging API Endpoints
    // ----------------------------------------------------
    // 1. GET /api/friends - List all friends of the current user
    if (pathname === '/api/friends' && req.method === 'GET') {
        try {
            let userId = parsedUrl.searchParams.get('userId');
            if (!userId) {
                const authHeader = req.headers.authorization;
                if (authHeader?.startsWith('Bearer ')) {
                    const decoded = jsonwebtoken_1.default.decode(authHeader.slice(7));
                    userId = decoded?.userId;
                }
            }
            if (!userId) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'User ID or Authorization token is required' }));
                return;
            }
            const friends = await (0, friendsStore_js_1.getFriendsForUser)(userId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'success', friends }));
        }
        catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }
    // 2. POST /api/friends/add - Add a friend by username
    if (pathname === '/api/friends/add' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', async () => {
            try {
                const parsed = JSON.parse(body || '{}');
                let userId = parsed.userId;
                if (!userId) {
                    const authHeader = req.headers.authorization;
                    if (authHeader?.startsWith('Bearer ')) {
                        const decoded = jsonwebtoken_1.default.decode(authHeader.slice(7));
                        userId = decoded?.userId;
                    }
                }
                const targetUsername = parsed.targetUsername || parsed.username;
                if (!userId || !targetUsername) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'userId and targetUsername are required' }));
                    return;
                }
                const result = await (0, friendsStore_js_1.addFriendForUser)(userId, targetUsername);
                if (!result.success) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: result.error }));
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'success', friend: result.friend }));
            }
            catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }
    // 3. POST /api/friends/remove - Remove a friend
    if (pathname === '/api/friends/remove' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', async () => {
            try {
                const parsed = JSON.parse(body || '{}');
                const { userId, friendId } = parsed;
                if (!userId || !friendId) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'userId and friendId are required' }));
                    return;
                }
                await (0, friendsStore_js_1.removeFriendForUser)(userId, friendId);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'success', message: 'Friend removed' }));
            }
            catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }
    // 4. GET /api/friends/suggestions - Suggested users to add
    if (pathname === '/api/friends/suggestions' && req.method === 'GET') {
        const suggestions = [
            { id: '11111111-1111-4111-8111-111111111111', username: 'alice', displayName: 'Alice Johnson' },
            { id: '22222222-2222-4222-8222-222222222222', username: 'bob', displayName: 'Bob Smith' },
            { id: '33333333-3333-4333-8333-333333333333', username: 'charlie', displayName: 'Charlie Brown' },
        ];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', suggestions }));
        return;
    }
    // 5. GET /api/direct-conversations - Whom I have messaged
    if (pathname === '/api/direct-conversations' && req.method === 'GET') {
        try {
            let userId = parsedUrl.searchParams.get('userId');
            if (!userId) {
                const authHeader = req.headers.authorization;
                if (authHeader?.startsWith('Bearer ')) {
                    const decoded = jsonwebtoken_1.default.decode(authHeader.slice(7));
                    userId = decoded?.userId;
                }
            }
            if (!userId) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Unauthorized' }));
                return;
            }
            const conversations = await (0, friendsStore_js_1.getDirectConversationsForUser)(userId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'success', conversations }));
        }
        catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }
    // ----------------------------------------------------
    // File & Photo Sharing Endpoints
    // ----------------------------------------------------
    // Upload attachment (Photo, File, Document)
    if (pathname === '/api/upload' && req.method === 'POST') {
        const chunks = [];
        let totalSize = 0;
        const MAX_SIZE = 50 * 1024 * 1024; // 50MB max file size
        req.on('data', (chunk) => {
            totalSize += chunk.length;
            if (totalSize <= MAX_SIZE) {
                chunks.push(chunk);
            }
        });
        req.on('end', async () => {
            if (totalSize > MAX_SIZE) {
                res.writeHead(413, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'File size exceeds 50MB limit' }));
                return;
            }
            try {
                const rawBuffer = Buffer.concat(chunks);
                let fileName = 'file';
                let mimeType = 'application/octet-stream';
                let fileBuffer = rawBuffer;
                const contentType = req.headers['content-type'] || '';
                if (contentType.includes('application/json')) {
                    const bodyStr = rawBuffer.toString('utf-8');
                    const parsed = JSON.parse(bodyStr || '{}');
                    fileName = parsed.fileName || parsed.file_name || 'attachment';
                    mimeType = parsed.fileType || parsed.mime_type || 'application/octet-stream';
                    let data = parsed.fileData || parsed.data || '';
                    if (data.includes(';base64,')) {
                        data = data.split(';base64,')[1];
                    }
                    fileBuffer = Buffer.from(data, 'base64');
                }
                else {
                    const headerFileName = req.headers['x-file-name'];
                    if (headerFileName && typeof headerFileName === 'string') {
                        fileName = decodeURIComponent(headerFileName);
                    }
                    if (contentType && !contentType.includes('multipart')) {
                        mimeType = contentType;
                    }
                }
                const safeName = path_1.default.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
                const storedFileName = `${Date.now()}_${crypto_1.default.randomBytes(6).toString('hex')}_${safeName}`;
                const filePath = path_1.default.join(UPLOADS_DIR, storedFileName);
                fs_1.default.writeFileSync(filePath, fileBuffer);
                const isImage = mimeType.startsWith('image/');
                const fileUrl = `/api/files/${encodeURIComponent(storedFileName)}`;
                const attachment = {
                    id: crypto_1.default.randomUUID(),
                    file_url: fileUrl,
                    thumbnail_url: isImage ? fileUrl : null,
                    file_name: fileName,
                    file_size: fileBuffer.length,
                    mime_type: mimeType,
                };
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'success', attachment }));
            }
            catch (err) {
                console.error('[Upload Error]', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message || 'Failed to upload file' }));
            }
        });
        return;
    }
    // Serve uploaded files & photos (with Range request 206 Partial Content support for audio/video streaming)
    if (pathname.startsWith('/api/files/') && req.method === 'GET') {
        try {
            const rawFileName = pathname.slice('/api/files/'.length);
            const fileName = path_1.default.basename(decodeURIComponent(rawFileName));
            const filePath = path_1.default.join(UPLOADS_DIR, fileName);
            if (!fs_1.default.existsSync(filePath)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'File not found' }));
                return;
            }
            const ext = path_1.default.extname(fileName).toLowerCase();
            const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
            const stat = fs_1.default.statSync(filePath);
            const totalSize = stat.size;
            const rangeHeader = req.headers.range;
            if (rangeHeader && rangeHeader.startsWith('bytes=')) {
                // Range: bytes=start-end (e.g. bytes=0- or bytes=1024-2048)
                const parts = rangeHeader.replace(/bytes=/, '').split('-');
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
                if (isNaN(start) || start >= totalSize || (parts[1] && isNaN(end)) || start > end) {
                    res.writeHead(416, {
                        'Content-Range': `bytes */${totalSize}`,
                        'Content-Type': mimeType,
                        'Accept-Ranges': 'bytes',
                    });
                    res.end();
                    return;
                }
                const chunkEnd = Math.min(end, totalSize - 1);
                const chunkSize = chunkEnd - start + 1;
                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${chunkEnd}/${totalSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunkSize,
                    'Content-Type': mimeType,
                    'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
                    'Cache-Control': 'public, max-age=86400',
                });
                const stream = fs_1.default.createReadStream(filePath, { start, end: chunkEnd });
                stream.pipe(res);
                return;
            }
            res.writeHead(200, {
                'Content-Type': mimeType,
                'Content-Length': totalSize,
                'Accept-Ranges': 'bytes',
                'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
                'Cache-Control': 'public, max-age=86400',
            });
            const stream = fs_1.default.createReadStream(filePath);
            stream.pipe(res);
        }
        catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }
    if (pathname === '/api/dev/seed' && req.method === 'POST') {
        try {
            const demoChat1 = '99999999-9999-4999-8999-999999999999';
            const demoChat2 = '88888888-8888-4888-8888-888888888888';
            const aliceId = '11111111-1111-4111-8111-111111111111';
            const bobId = '22222222-2222-4222-8222-222222222222';
            const charlieId = '33333333-3333-4333-8333-333333333333';
            // Upsert in memory stores
            await (0, chatStore_js_1.ensureChatExists)(demoChat1, '🚀 Telegram Core Team', 'GROUP');
            await (0, chatStore_js_1.ensureChatExists)(demoChat2, '💬 General Lounge', 'GROUP');
            for (const cid of [demoChat1, demoChat2]) {
                for (const uid of [aliceId, bobId, charlieId]) {
                    await (0, chatStore_js_1.checkParticipant)(cid, uid);
                }
            }
            // Upsert demo users and chats in Prisma if available
            try {
                const users = [
                    { id: aliceId, username: 'alice', displayName: 'Alice Johnson', passwordHash: 'hash' },
                    { id: bobId, username: 'bob', displayName: 'Bob Smith', passwordHash: 'hash' },
                    { id: charlieId, username: 'charlie', displayName: 'Charlie Brown', passwordHash: 'hash' },
                ];
                for (const u of users) {
                    await prisma_js_1.prisma.user.upsert({
                        where: { id: u.id },
                        update: { displayName: u.displayName },
                        create: u,
                    });
                }
                await prisma_js_1.prisma.chat.upsert({
                    where: { id: demoChat1 },
                    update: { title: 'Telegram Core Team' },
                    create: {
                        id: demoChat1,
                        type: 'GROUP',
                        title: 'Telegram Core Team',
                    },
                });
                await prisma_js_1.prisma.chat.upsert({
                    where: { id: demoChat2 },
                    update: { title: 'General Lounge' },
                    create: {
                        id: demoChat2,
                        type: 'GROUP',
                        title: 'General Lounge',
                    },
                });
                for (const cid of [demoChat1, demoChat2]) {
                    for (const uid of [aliceId, bobId, charlieId]) {
                        await prisma_js_1.prisma.chatParticipant.upsert({
                            where: { chatId_userId: { chatId: cid, userId: uid } },
                            update: {},
                            create: {
                                chatId: cid,
                                userId: uid,
                            },
                        });
                    }
                }
            }
            catch (dbErr) {
                console.warn('[Seed] DB unavailable, seeded active in-memory stores:', dbErr.message);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'success', message: 'Demo data seeded successfully' }));
        }
        catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
}
async function bootstrap() {
    console.log('--- Initializing Telegram Real-Time Messaging Engine ---');
    // 1. Connect Redis clients
    try {
        await (0, client_js_1.initRedis)();
        (0, pubsub_js_1.initPubSubDispatcher)();
    }
    catch (err) {
        console.warn('[Redis] Warning: Could not connect to Redis at startup. Real-time clustering will retry in background:', err.message);
    }
    // 2. Create HTTP server for health checks, auth & WS upgrade
    const server = http_1.default.createServer(handleHttpRequest);
    // 3. Attach WebSocket Gateway
    const wss = (0, server_js_1.initWebSocketServer)(server);
    // 4. Start listening
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`[HTTP/WS Server Error] Port ${index_js_1.config.port} is already in use. Please free port ${index_js_1.config.port} or set a different PORT in .env`);
        }
        else {
            console.error('[HTTP/WS Server Error]', err);
        }
        process.exit(1);
    });
    server.listen(index_js_1.config.port, '0.0.0.0', () => {
        console.log(`[HTTP/WS Server] Listening on http://localhost:${index_js_1.config.port}`);
        console.log(`[WebSocket Endpoint] ws://localhost:${index_js_1.config.port}/ws`);
    });
    // 5. Graceful Shutdown Handlers
    const shutdown = async (signal) => {
        console.log(`\n[Shutdown] Received ${signal}. Draining connections...`);
        wss.close(() => {
            console.log('[Shutdown] Closed all WebSocket connections.');
        });
        server.close(() => {
            console.log('[Shutdown] Closed HTTP server.');
        });
        try {
            const closeClient = async (c) => {
                if (c.status === 'ready' || c.status === 'connecting') {
                    await c.quit().catch(() => c.disconnect());
                }
            };
            await Promise.all([
                closeClient(client_js_1.redis),
                closeClient(client_js_1.redisPub),
                closeClient(client_js_1.redisSub),
                prisma_js_1.prisma.$disconnect(),
            ]);
            console.log('[Shutdown] Disconnected from Redis and PostgreSQL.');
        }
        catch (e) {
            console.error('[Shutdown Error]', e);
        }
        process.exit(0);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}
const isMain = process.argv[1] && (process.argv[1].endsWith('src/index.ts') ||
    process.argv[1].endsWith('src\\index.ts') ||
    process.argv[1].endsWith('dist/index.js') ||
    process.argv[1].endsWith('dist\\index.js'));
if (isMain && process.env.NODE_ENV !== 'test') {
    bootstrap().catch((err) => {
        console.error('[Fatal Bootstrap Error]', err);
        process.exit(1);
    });
}
