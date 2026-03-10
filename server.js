// ============================================
// CHATHUB - Backend Server (Master Admin Fixed)
// Node.js + Express + Socket.IO
// ============================================

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

// ============================================
// CONFIGURATION & SETUP
// ============================================
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'chathub-super-secret-key-2024';
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
const DATA_DIR = path.join(__dirname, 'data');

async function ensureDirectories() {
    const dirs = [UPLOAD_DIR, DATA_DIR, path.join(__dirname, 'public', 'icons')];
    for (const dir of dirs) {
        try { await fs.mkdir(dir, { recursive: true }); } catch (e) {}
    }
}

// ============================================
// DATABASE (In-Memory)
// ============================================
const db = {
    users: new Map(),
    rooms: new Map(),
    messages: new Map(),
    onlineUsers: new Map()
};

// Default room
db.rooms.set('general', {
    id: 'general', name: 'general', description: 'General discussion',
    icon: '💬', type: 'public', createdAt: new Date().toISOString()
});
db.messages.set('general', []);

// ============================================
// EXPRESS APP
// ============================================
const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================
// MIDDLEWARE
// ============================================
function authenticateToken(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access token required' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
}

// ============================================
// API ROUTES (Must be before static files!)
// ============================================

// 1. MASTER LOGIN ENDPOINT
app.post('/api/auth/master-login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (username.toLowerCase() === 'charles master' && password === 'king1master') {
            
            let masterUser = Array.from(db.users.values()).find(u => u.username === 'charles master');
            
            // Create Master User in DB if doesn't exist
            if (!masterUser) {
                const hashedPassword = await bcrypt.hash(password, 10);
                const masterId = 'master_1';
                
                masterUser = {
                    id: masterId,
                    username: 'charles master',
                    email: 'master@system.local',
                    password: hashedPassword,
                    displayName: 'Charles Master',
                    avatar: null,
                    bio: 'System Master Administrator',
                    role: 'master',
                    status: 'online',
                    createdAt: new Date().toISOString()
                };
                db.users.set(masterId, masterUser);
            }

            const token = jwt.sign(
                { id: masterUser.id, username: masterUser.username, role: masterUser.role },
                JWT_SECRET, { expiresIn: '7d' }
            );

            const { password: _, ...safeUser } = masterUser;
            console.log("Master login successful!");
            return res.json({ token, user: safeUser });
        }

        return res.status(401).json({ error: 'Invalid master credentials' });
    } catch (error) {
        console.error('Master login error:', error);
        res.status(500).json({ error: 'Master login failed' });
    }
});

// 2. STANDARD REGISTER
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password, displayName } = req.body;
        if (!username || !email || !password) return res.status(400).json({ error: 'Missing fields' });

        if (Array.from(db.users.values()).some(u => u.username === username || u.email === email)) {
            return res.status(400).json({ error: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = crypto.randomBytes(16).toString('hex');
        
        const user = {
            id: userId, username, email, password: hashedPassword,
            displayName: displayName || username, avatar: null, bio: '',
            role: 'member', status: 'online', createdAt: new Date().toISOString()
        };

        db.users.set(userId, user);
        const token = jwt.sign({ id: userId, username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        
        const { password: _, ...safeUser } = user;
        res.json({ token, user: safeUser });
    } catch (error) {
        res.status(500).json({ error: 'Registration failed' });
    }
});

// 3. STANDARD LOGIN
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = Array.from(db.users.values()).find(u => u.username === username || u.email === username);

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        const { password: _, ...safeUser } = user;
        res.json({ token, user: safeUser });
    } catch (error) {
        res.status(500).json({ error: 'Login failed' });
    }
});

// 4. VERIFY TOKEN
app.get('/api/auth/verify', authenticateToken, (req, res) => {
    const user = db.users.get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { password: _, ...safeUser } = user;
    res.json({ user: safeUser });
});

// 5. ROOMS
app.get('/api/rooms', authenticateToken, (req, res) => res.json({ rooms: Array.from(db.rooms.values()) }));
app.post('/api/rooms', authenticateToken, (req, res) => {
    const { name, description, icon, type } = req.body;
    const roomId = name.toLowerCase().replace(/\s+/g, '-');
    if (db.rooms.has(roomId)) return res.status(400).json({ error: 'Room exists' });

    const room = { id: roomId, name, description, icon: icon || '💬', type: type || 'public', createdBy: req.user.id, createdAt: new Date().toISOString() };
    db.rooms.set(roomId, room);
    db.messages.set(roomId, []);
    io.emit('room_created', { room });
    res.json({ room });
});

// 6. PROFILE
app.put('/api/users/profile', authenticateToken, (req, res) => {
    const user = db.users.get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (req.body.displayName) user.displayName = req.body.displayName;
    if (req.body.bio !== undefined) user.bio = req.body.bio;
    const { password: _, ...safeUser } = user;
    res.json({ user: safeUser });
});

// ============================================
// STATIC FILES & ERROR FALLBACKS
// ============================================
app.use(express.static(__dirname));
app.use('/uploads', express.static(UPLOAD_DIR));

// Fix for missing icons (returns a transparent 1x1 pixel)
app.get('/icons/*', (req, res) => {
    const img = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': img.length });
    res.end(img);
});

// ============================================
// SOCKET.IO EVENTS
// ============================================
io.on('connection', (socket) => {
    let currentUser = null;
    let currentRoom = 'general';

    socket.on('auth', (data) => {
        try {
            const decoded = jwt.verify(data.token, JWT_SECRET);
            const user = db.users.get(decoded.id);
            if (!user) return socket.emit('error', { error: 'User not found' });

            currentUser = user;
            const { password: _, ...safeUser } = user;
            db.onlineUsers.set(user.id, { ...safeUser, socketId: socket.id });

            socket.emit('auth_success', {
                user: safeUser,
                rooms: Array.from(db.rooms.values()),
                online: Array.from(db.onlineUsers.values()),
                allUsers: Array.from(db.users.values()).map(u => { const { password, ...s } = u; return s; })
            });

            socket.broadcast.emit('user_online', { user: safeUser });
        } catch (error) {
            socket.emit('error', { error: 'Auth failed' });
        }
    });

    socket.on('join', (data) => {
        if (!currentUser) return;
        if (!db.rooms.has(data.roomId)) return socket.emit('error', { error: 'Room not found' });
        socket.leave(currentRoom);
        currentRoom = data.roomId;
        socket.join(currentRoom);
        socket.emit('joined', { roomId: currentRoom, messages: db.messages.get(currentRoom).slice(-100) });
    });

    socket.on('message', (data) => {
        if (!currentUser || currentUser.muted) return;
        const msg = {
            id: crypto.randomBytes(16).toString('hex'), tempId: data.tempId, roomId: currentRoom,
            userId: currentUser.id, username: currentUser.username, displayName: currentUser.displayName,
            avatar: currentUser.avatar, role: currentUser.role, text: data.text || '',
            attachment: data.attachment, replyTo: data.replyTo, reactions: {}, createdAt: new Date().toISOString()
        };
        db.messages.get(currentRoom).push(msg);
        socket.to(currentRoom).emit('new_message', { message: msg });
        socket.emit('message_sent', { tempId: data.tempId, message: msg });
    });

    socket.on('disconnect', () => {
        if (currentUser) {
            db.onlineUsers.delete(currentUser.id);
            io.emit('user_offline', { userId: currentUser.id });
        }
    });
});

// ============================================
// START
// ============================================
ensureDirectories().then(() => {
    server.listen(PORT, () => console.log(`Server running perfectly on http://localhost:${PORT}`));
});