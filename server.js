const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const fs = require('fs');

const PORT = 3001;
const JWT_SECRET = 'secret-key-123';

console.log('🚀 Starting server...');

if (!fs.existsSync('public/uploads/avatars')) fs.mkdirSync('public/uploads/avatars', { recursive: true });
if (!fs.existsSync('public/uploads/attachments')) fs.mkdirSync('public/uploads/attachments', { recursive: true });

const db = {
  users: new Map(),
  rooms: new Map(),
  messages: new Map()
};

const masterId = uuidv4();
db.users.set(masterId, {
  id: masterId,
  username: 'master',
  email: 'master@chat.com',
  password: bcrypt.hashSync('master123', 10),
  displayName: 'Master',
  role: 'master',
  status: 'online',
  avatar: null,
  bio: '',
  banned: false,
  createdAt: new Date().toISOString()
});

['general', 'random', 'help'].forEach(id => {
  db.rooms.set(id, { id, name: id.charAt(0).toUpperCase() + id.slice(1), icon: '💬', description: '', adminIds: [], moderatorIds: [] });
  db.messages.set(id, []);
});

console.log('✅ Database ready');

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.static('public'));

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, file.fieldname === 'avatar' ? 'public/uploads/avatars' : 'public/uploads/attachments'),
    filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
  }),
  limits: { fileSize: 10 * 1024 * 1024 }
});

function generateToken(user) { return jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' }); }
function verifyToken(token) { try { return jwt.verify(token, JWT_SECRET); } catch { return null; } }
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Unauthorized' });
  req.user = db.users.get(decoded.id);
  if (!req.user) return res.status(401).json({ error: 'User not found' });
  next();
}
function sanitize(user) { const { password, ...safe } = user; return safe; }
function findUser(username) { for (const u of db.users.values()) if (u.username === username || u.email === username) return u; return null; }

const wss = new WebSocket.Server({ server });
const connections = new Map();

function broadcast(data, roomId) {
  const msg = JSON.stringify(data);
  connections.forEach(c => {
    if ((!roomId || c.roomId === roomId) && c.ws.readyState === WebSocket.OPEN) c.ws.send(msg);
  });
}

function getOnlineUsers() {
  const users = new Map();
  connections.forEach(c => { if (c.user) users.set(c.user.id, { id: c.user.id, username: c.user.username, displayName: c.user.displayName, avatar: c.user.avatar, status: 'online', role: c.user.role }); });
  return Array.from(users.values());
}

wss.on('connection', ws => {
  const id = uuidv4();
  ws.send(JSON.stringify({ type: 'connected', connectionId: id }));

  ws.on('message', msg => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'auth') {
        const decoded = verifyToken(data.token);
        if (!decoded) return ws.send(JSON.stringify({ type: 'auth_error', message: 'Invalid' }));
        const user = db.users.get(decoded.id);
        if (!user) return ws.send(JSON.stringify({ type: 'auth_error', message: 'Not found' }));
        connections.set(id, { ws, user: sanitize(user), roomId: null });
        ws.send(JSON.stringify({ type: 'auth_success', user: sanitize(user), rooms: Array.from(db.rooms.values()), onlineUsers: getOnlineUsers() }));
        broadcast({ type: 'user_status_change', userId: user.id, username: user.username, displayName: user.displayName, avatar: user.avatar, status: 'online', role: user.role });
      }
      if (data.type === 'join_room') {
        const c = connections.get(id);
        if (c) { c.roomId = data.roomId; const msgs = db.messages.get(data.roomId) || []; ws.send(JSON.stringify({ type: 'room_joined', roomId: data.roomId, messages: msgs.slice(-50), lastMessageId: msgs.length ? msgs[msgs.length - 1].id : null, pinnedMessages: [] })); }
      }
      if (data.type === 'message') {
        const c = connections.get(id);
        if (c && c.roomId) {
          const m = { id: uuidv4(), roomId: c.roomId, userId: c.user.id, username: c.user.username, displayName: c.user.displayName, avatar: c.user.avatar, role: c.user.role, text: data.text || '', attachment: data.attachment, replyTo: data.replyTo, reactions: {}, edited: false, createdAt: new Date().toISOString() };
          const msgs = db.messages.get(c.roomId) || []; msgs.push(m); db.messages.set(c.roomId, msgs);
          broadcast({ type: 'new_message', message: m }, c.roomId);
        }
      }
      if (data.type === 'typing') { const c = connections.get(id); if (c && c.roomId) broadcast({ type: 'user_typing', roomId: c.roomId, userId: c.user.id, username: c.user.username, displayName: c.user.displayName, isTyping: data.isTyping }, c.roomId); }
      if (data.type === 'reaction') {
        const c = connections.get(id);
        if (c) {
          const msgs = db.messages.get(c.roomId) || [];
          const m = msgs.find(x => x.id === data.messageId);
          if (m) {
            if (!m.reactions) m.reactions = {};
            if (!m.reactions[data.emoji]) m.reactions[data.emoji] = [];
            const idx = m.reactions[data.emoji].indexOf(c.user.id);
            if (idx > -1) { m.reactions[data.emoji].splice(idx, 1); if (!m.reactions[data.emoji].length) delete m.reactions[data.emoji]; }
            else m.reactions[data.emoji].push(c.user.id);
            broadcast({ type: 'reaction_updated', messageId: data.messageId, reactions: m.reactions }, c.roomId);
          }
        }
      }
      if (data.type === 'edit_message') {
        const c = connections.get(id);
        if (c) {
          const msgs = db.messages.get(c.roomId) || [];
          const m = msgs.find(x => x.id === data.messageId);
          if (m && m.userId === c.user.id) { m.text = data.text; m.edited = true; broadcast({ type: 'message_edited', messageId: data.messageId, text: data.text }, c.roomId); }
        }
      }
      if (data.type === 'delete_message') {
        const c = connections.get(id);
        if (c) {
          const msgs = db.messages.get(c.roomId) || [];
          const idx = msgs.findIndex(x => x.id === data.messageId);
          if (idx > -1 && (msgs[idx].userId === c.user.id || c.user.role === 'master' || c.user.role === 'admin')) {
            msgs.splice(idx, 1); db.messages.set(c.roomId, msgs);
            broadcast({ type: 'message_deleted', messageId: data.messageId }, c.roomId);
          }
        }
      }
      if (data.type === 'status_change') {
        const c = connections.get(id);
        if (c && c.user) {
          const u = db.users.get(c.user.id); if (u) u.status = data.status; c.user.status = data.status;
          broadcast({ type: 'user_status_change', userId: c.user.id, username: c.user.username, displayName: c.user.displayName, avatar: c.user.avatar, status: data.status, role: c.user.role });
        }
      }
      if (data.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
    } catch (e) { console.error('WS error:', e); }
  });

  ws.on('close', () => { const c = connections.get(id); if (c && c.user) broadcast({ type: 'user_status_change', userId: c.user.id, status: 'offline' }); connections.delete(id); });
});

console.log('✅ WebSocket ready');

// AUTH
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const user = findUser(username);
  if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: 'Invalid credentials' });
  if (user.banned) return res.status(403).json({ error: 'Banned' });
  res.json({ success: true, token: generateToken(user), user: sanitize(user) });
});
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password, displayName } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  if (findUser(username) || findUser(email)) return res.status(400).json({ error: 'User exists' });
  const id = uuidv4();
  const user = { id, username, email, password: await bcrypt.hash(password, 10), displayName: displayName || username, role: 'member', status: 'online', avatar: null, bio: '', banned: false, createdAt: new Date().toISOString() };
  db.users.set(id, user);
  res.json({ success: true, token: generateToken(user), user: sanitize(user) });
});
app.get('/api/auth/verify', authMiddleware, (req, res) => res.json({ success: true, user: sanitize(req.user) }));
app.post('/api/auth/logout', authMiddleware, (req, res) => res.json({ success: true }));

// USERS
app.get('/api/users/:userId', authMiddleware, (req, res) => {
  const user = db.users.get(req.params.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: sanitize(user) });
});
app.put('/api/users/profile', authMiddleware, (req, res) => {
  const { displayName, bio } = req.body;
  const user = db.users.get(req.user.id);
  if (displayName) user.displayName = displayName;
  if (bio !== undefined) user.bio = bio;
  res.json({ success: true, user: sanitize(user) });
});
app.post('/api/users/avatar', authMiddleware, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const user = db.users.get(req.user.id);
  user.avatar = `/uploads/avatars/${req.file.filename}`;
  res.json({ success: true, avatar: user.avatar });
});

// ROOMS
app.get('/api/rooms', authMiddleware, (req, res) => res.json({ rooms: Array.from(db.rooms.values()) }));
app.post('/api/rooms', authMiddleware, (req, res) => {
  const { name, description, icon } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const id = uuidv4();
  const room = { id, name, description: description || '', icon: icon || '💬', adminIds: [req.user.id], moderatorIds: [] };
  db.rooms.set(id, room); db.messages.set(id, []);
  broadcast({ type: 'room_created', room });
  res.json({ success: true, room });
});
app.put('/api/rooms/:roomId/settings', authMiddleware, (req, res) => {
  const room = db.rooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  const { name, description, icon } = req.body;
  if (name) room.name = name; if (description !== undefined) room.description = description; if (icon) room.icon = icon;
  res.json({ success: true });
});
app.delete('/api/rooms/:roomId', authMiddleware, (req, res) => {
  if (['general', 'random', 'help'].includes(req.params.roomId)) return res.status(400).json({ error: 'Cannot delete default' });
  db.rooms.delete(req.params.roomId); db.messages.delete(req.params.roomId);
  broadcast({ type: 'room_deleted', roomId: req.params.roomId });
  res.json({ success: true });
});
app.delete('/api/rooms/:roomId/messages', authMiddleware, (req, res) => { db.messages.set(req.params.roomId, []); res.json({ success: true }); });

// MESSAGES
app.get('/api/messages/:roomId', authMiddleware, (req, res) => {
  const msgs = db.messages.get(req.params.roomId) || [];
  res.json({ messages: msgs.slice(-50), lastMessageId: msgs.length ? msgs[msgs.length - 1].id : null });
});
app.post('/api/messages/:roomId', authMiddleware, (req, res) => {
  const m = { id: uuidv4(), roomId: req.params.roomId, userId: req.user.id, username: req.user.username, displayName: req.user.displayName, avatar: req.user.avatar, role: req.user.role, text: req.body.text || '', attachment: req.body.attachment, replyTo: req.body.replyTo, reactions: {}, edited: false, createdAt: new Date().toISOString() };
  const msgs = db.messages.get(req.params.roomId) || []; msgs.push(m); db.messages.set(req.params.roomId, msgs);
  broadcast({ type: 'new_message', message: m }, req.params.roomId);
  res.json({ success: true, message: m });
});
app.get('/api/messages/search/:query', authMiddleware, (req, res) => {
  const query = req.params.query.toLowerCase();
  const msgs = db.messages.get(req.query.roomId) || [];
  res.json({ messages: msgs.filter(m => m.text && m.text.toLowerCase().includes(query)) });
});

// PINS
app.get('/api/rooms/:roomId/pins', authMiddleware, (req, res) => res.json({ pinnedMessages: [] }));
app.post('/api/rooms/:roomId/pin', authMiddleware, (req, res) => res.json({ success: true }));
app.delete('/api/rooms/:roomId/pin/:messageId', authMiddleware, (req, res) => res.json({ success: true }));

// DM
app.get('/api/dm', authMiddleware, (req, res) => res.json({ conversations: [] }));
app.get('/api/dm/:userId', authMiddleware, (req, res) => res.json({ messages: [] }));
app.post('/api/dm/:userId', authMiddleware, (req, res) => res.json({ success: true, message: {} }));

// THREADS
app.get('/api/threads/:messageId', authMiddleware, (req, res) => res.json({ parentMessage: null, replies: [] }));
app.post('/api/threads/:messageId', authMiddleware, (req, res) => res.json({ success: true, message: {} }));

// SYNC
app.get('/api/sync', authMiddleware, (req, res) => {
  const msgs = db.messages.get(req.query.roomId) || [];
  res.json({ roomMessages: msgs.slice(-50), lastRoomMessageId: msgs.length ? msgs[msgs.length - 1].id : null, dmMessages: [], onlineUsers: getOnlineUsers(), timestamp: Date.now() });
});

// UPLOAD
app.post('/api/upload/attachment', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ success: true, file: { url: `/uploads/attachments/${req.file.filename}`, name: req.file.originalname, size: req.file.size, type: req.file.mimetype } });
});

// ROOM MODERATION
app.post('/api/rooms/:roomId/kick', authMiddleware, (req, res) => res.json({ success: true }));
app.post('/api/rooms/:roomId/mute', authMiddleware, (req, res) => res.json({ success: true }));
app.post('/api/rooms/:roomId/unmute', authMiddleware, (req, res) => res.json({ success: true }));
app.post('/api/rooms/:roomId/ban', authMiddleware, (req, res) => res.json({ success: true }));
app.post('/api/rooms/:roomId/unban', authMiddleware, (req, res) => res.json({ success: true }));
app.get('/api/rooms/:roomId/banned', authMiddleware, (req, res) => res.json({ users: [] }));
app.post('/api/rooms/:roomId/moderators', authMiddleware, (req, res) => res.json({ success: true }));
app.delete('/api/rooms/:roomId/moderators/:userId', authMiddleware, (req, res) => res.json({ success: true }));

// ADMIN
app.get('/api/admin/stats', authMiddleware, (req, res) => {
  res.json({ totalUsers: db.users.size, onlineUsers: getOnlineUsers().length, totalMessages: Array.from(db.messages.values()).reduce((s, a) => s + a.length, 0), totalRooms: db.rooms.size, bannedUsers: 0 });
});
app.get('/api/admin/users', authMiddleware, (req, res) => res.json({ users: Array.from(db.users.values()).map(sanitize), total: db.users.size }));
app.get('/api/admin/users/banned', authMiddleware, (req, res) => res.json({ users: [] }));
app.post('/api/admin/users/:userId/ban', authMiddleware, (req, res) => res.json({ success: true }));
app.post('/api/admin/users/:userId/unban', authMiddleware, (req, res) => res.json({ success: true }));
app.put('/api/admin/users/:userId/role', authMiddleware, (req, res) => res.json({ success: true }));
app.delete('/api/admin/users/:userId', authMiddleware, (req, res) => res.json({ success: true }));
app.delete('/api/admin/messages/:messageId', authMiddleware, (req, res) => res.json({ success: true }));
app.post('/api/admin/announcement', authMiddleware, (req, res) => { broadcast({ type: 'announcement', message: req.body.message, from: req.user.displayName }); res.json({ success: true }); });

// SPA
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

server.listen(PORT, () => {
  console.log('');
  console.log('=================================');
  console.log('✅ ChatHub Server RUNNING');
  console.log(`🌐 http://localhost:${PORT}`);
  console.log('👤 master / master123');
  console.log('=================================');
});