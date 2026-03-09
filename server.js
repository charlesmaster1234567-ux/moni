const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Request logging
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Ensure directories exist
const dirs = ['./data', './public/uploads', './public/uploads/avatars', './public/uploads/attachments'];
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = req.params.type || 'attachments';
    cb(null, `./public/uploads/${type}`);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx|txt|mp3|mp4/;
    const ext = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mime = allowedTypes.test(file.mimetype);
    if (ext || mime) cb(null, true);
    else cb(new Error('Invalid file type'));
  }
});

// ============================================
// IN-MEMORY DATABASE
// ============================================
const db = {
  users: new Map(),
  sessions: new Map(),
  messages: [], // Changed to array for easier polling
  messageIndex: new Map(), // messageId -> index in messages array
  rooms: new Map([
    ['general', { id: 'general', name: 'General', description: 'General discussion', icon: '💬', isPrivate: false, createdBy: 'system' }],
    ['random', { id: 'random', name: 'Random', description: 'Random stuff', icon: '🎲', isPrivate: false, createdBy: 'system' }],
    ['tech', { id: 'tech', name: 'Tech Talk', description: 'Technology discussions', icon: '💻', isPrivate: false, createdBy: 'system' }],
    ['gaming', { id: 'gaming', name: 'Gaming', description: 'Game discussions', icon: '🎮', isPrivate: false, createdBy: 'system' }],
    ['music', { id: 'music', name: 'Music', description: 'Share your favorite tunes', icon: '🎵', isPrivate: false, createdBy: 'system' }]
  ]),
  directMessages: new Map(),
  reactions: new Map(),
  pinnedMessages: new Map(),
  threads: new Map(),
  // Polling support
  lastMessageId: 0,
  lastDMMessageId: 0
};

// Active WebSocket connections
const connections = new Map();

// ============================================
// HELPER FUNCTIONS
// ============================================
function generateUserId() {
  return `U${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
}

function generateSessionToken() {
  return uuidv4() + '-' + uuidv4();
}

function generateMessageId() {
  db.lastMessageId++;
  return `M${db.lastMessageId}_${Date.now().toString(36)}`;
}

function generateDMMessageId() {
  db.lastDMMessageId++;
  return `DM${db.lastDMMessageId}_${Date.now().toString(36)}`;
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function sanitizeUser(user) {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return safeUser;
}

function broadcast(data, roomId = null, excludeUserId = null) {
  const message = JSON.stringify(data);
  connections.forEach((conn) => {
    try {
      if (conn.ws.readyState === WebSocket.OPEN) {
        if (excludeUserId && conn.user?.id === excludeUserId) return;
        if (roomId && conn.currentRoom !== roomId && data.type !== 'user_status_change') return;
        conn.ws.send(message);
      }
    } catch (err) {
      console.error('Broadcast error:', err);
    }
  });
}

function broadcastToUser(userId, data) {
  const message = JSON.stringify(data);
  connections.forEach((conn) => {
    try {
      if (conn.user?.id === userId && conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(message);
      }
    } catch (err) {
      console.error('BroadcastToUser error:', err);
    }
  });
}

function getOnlineUsers() {
  const users = [];
  const seen = new Set();
  connections.forEach((conn) => {
    if (conn.user && !seen.has(conn.user.id)) {
      seen.add(conn.user.id);
      users.push({
        ...conn.user,
        status: conn.status || 'online'
      });
    }
  });
  return users;
}

function formatDate(date) {
  return new Date(date).toISOString();
}

function getSessionFromToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const token = authHeader.replace('Bearer ', '');
  return db.sessions.get(token);
}

// Get numeric sequence from message ID for comparison
function getMessageSequence(messageId) {
  if (!messageId) return 0;
  const match = messageId.match(/^[DM]*(\d+)_/);
  return match ? parseInt(match[1]) : 0;
}

// ============================================
// AUTH MIDDLEWARE
// ============================================
function authMiddleware(req, res, next) {
  const session = getSessionFromToken(req);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const user = db.users.get(session.userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }
  req.session = session;
  req.user = user;
  next();
}

// ============================================
// AUTH ROUTES
// ============================================
app.post('/api/auth/register', (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const trimmedUsername = String(username).trim();
    const trimmedEmail = String(email).trim().toLowerCase();

    if (trimmedUsername.length < 3 || trimmedUsername.length > 20) {
      return res.status(400).json({ error: 'Username must be 3-20 characters' });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    for (const [, user] of db.users) {
      if (user.username.toLowerCase() === trimmedUsername.toLowerCase()) {
        return res.status(400).json({ error: 'Username already taken' });
      }
      if (user.email.toLowerCase() === trimmedEmail) {
        return res.status(400).json({ error: 'Email already registered' });
      }
    }

    const userId = generateUserId();
    const user = {
      id: userId,
      username: trimmedUsername,
      email: trimmedEmail,
      password: hashPassword(password),
      displayName: displayName?.trim() || trimmedUsername,
      avatar: null,
      bio: '',
      status: 'online',
      createdAt: formatDate(new Date()),
      lastSeen: formatDate(new Date())
    };

    db.users.set(userId, user);

    const sessionToken = generateSessionToken();
    db.sessions.set(sessionToken, { userId, createdAt: Date.now() });

    res.json({ success: true, user: sanitizeUser(user), token: sessionToken });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const trimmedUsername = String(username).trim().toLowerCase();

    let foundUser = null;
    for (const [, user] of db.users) {
      if (user.username.toLowerCase() === trimmedUsername || 
          user.email.toLowerCase() === trimmedUsername) {
        foundUser = user;
        break;
      }
    }

    if (!foundUser || !verifyPassword(password, foundUser.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    foundUser.lastSeen = formatDate(new Date());

    const sessionToken = generateSessionToken();
    db.sessions.set(sessionToken, { userId: foundUser.id, createdAt: Date.now() });

    res.json({ success: true, user: sanitizeUser(foundUser), token: sessionToken });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/verify', (req, res) => {
  const session = getSessionFromToken(req);
  if (!session) {
    return res.status(401).json({ error: 'Invalid session' });
  }
  const user = db.users.get(session.userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }
  res.json({ success: true, user: sanitizeUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) db.sessions.delete(token);
  res.json({ success: true });
});

// ============================================
// USER ROUTES
// ============================================
app.put('/api/users/profile', authMiddleware, (req, res) => {
  const user = req.user;
  const { displayName, bio, theme, notificationSound, desktopNotifications } = req.body;

  if (displayName !== undefined) user.displayName = String(displayName).trim() || user.username;
  if (bio !== undefined) user.bio = String(bio).trim().substring(0, 500);
  if (theme !== undefined) user.theme = theme;
  if (notificationSound !== undefined) user.notificationSound = Boolean(notificationSound);
  if (desktopNotifications !== undefined) user.desktopNotifications = Boolean(desktopNotifications);

  res.json({ success: true, user: sanitizeUser(user) });
});

app.post('/api/users/avatar', authMiddleware, upload.single('avatar'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  if (req.user.avatar) {
    const oldPath = path.join(__dirname, 'public', req.user.avatar);
    if (fs.existsSync(oldPath)) {
      try { fs.unlinkSync(oldPath); } catch (e) {}
    }
  }

  req.user.avatar = `/uploads/avatars/${req.file.filename}`;
  res.json({ success: true, avatar: req.user.avatar });
});

app.post('/api/upload/attachment', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({
    success: true,
    file: {
      url: `/uploads/attachments/${req.file.filename}`,
      name: req.file.originalname,
      size: req.file.size,
      type: req.file.mimetype
    }
  });
});

app.get('/api/users/:userId', (req, res) => {
  const user = db.users.get(req.params.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ user: sanitizeUser(user) });
});

app.get('/api/users/search/:query', authMiddleware, (req, res) => {
  const query = req.params.query.toLowerCase();
  const users = [];
  db.users.forEach((user) => {
    if (user.username.toLowerCase().includes(query) || 
        (user.displayName && user.displayName.toLowerCase().includes(query))) {
      users.push(sanitizeUser(user));
    }
  });
  res.json({ users: users.slice(0, 10) });
});

// ============================================
// ROOM ROUTES
// ============================================
app.get('/api/rooms', (req, res) => {
  res.json({ rooms: Array.from(db.rooms.values()) });
});

app.post('/api/rooms', authMiddleware, (req, res) => {
  const { name, description, icon, isPrivate } = req.body;

  if (!name || String(name).trim().length < 2) {
    return res.status(400).json({ error: 'Room name must be at least 2 characters' });
  }

  const roomId = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  
  if (db.rooms.has(roomId)) {
    return res.status(400).json({ error: 'Room already exists' });
  }

  const room = {
    id: roomId,
    name: String(name).trim(),
    description: description?.trim() || '',
    icon: icon || '💬',
    isPrivate: Boolean(isPrivate),
    createdBy: req.user.id,
    createdAt: formatDate(new Date())
  };

  db.rooms.set(room.id, room);
  broadcast({ type: 'room_created', room });

  res.json({ success: true, room });
});

// ============================================
// MESSAGE ROUTES (WITH POLLING SUPPORT)
// ============================================

// Get messages for a room (supports polling with "since" parameter)
app.get('/api/messages/:roomId', (req, res) => {
  const { roomId } = req.params;
  const { since, limit = 50 } = req.query;

  let messages = db.messages.filter(m => m.roomId === roomId);

  // If "since" is provided, only return messages after that ID
  if (since) {
    const sinceSeq = getMessageSequence(since);
    messages = messages.filter(m => getMessageSequence(m.id) > sinceSeq);
  } else {
    // Return last N messages
    messages = messages.slice(-parseInt(limit));
  }

  // Add reactions and thread count
  messages = messages.map(m => ({
    ...m,
    reactions: db.reactions.get(m.id) || {},
    threadCount: db.threads.has(m.id) ? db.threads.get(m.id).messages.length : 0
  }));

  res.json({ 
    messages,
    lastMessageId: messages.length > 0 ? messages[messages.length - 1].id : since || null
  });
});

// Send a message via HTTP (for offline/polling mode)
app.post('/api/messages/:roomId', authMiddleware, (req, res) => {
  try {
    const { roomId } = req.params;
    const { text, attachment, replyTo } = req.body;

    const trimmedText = text ? String(text).trim() : '';
    const hasText = trimmedText.length > 0;
    const hasAttachment = attachment && attachment.url;

    if (!hasText && !hasAttachment) {
      return res.status(400).json({ error: 'Message text or attachment required' });
    }

    if (!db.rooms.has(roomId)) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const messageId = generateMessageId();
    const newMessage = {
      id: messageId,
      roomId,
      userId: req.user.id,
      username: req.user.username,
      displayName: req.user.displayName,
      avatar: req.user.avatar,
      text: trimmedText,
      attachment: hasAttachment ? attachment : null,
      replyTo: replyTo || null,
      edited: false,
      createdAt: formatDate(new Date())
    };

    // Store message
    db.messages.push(newMessage);
    db.messageIndex.set(messageId, db.messages.length - 1);

    // Cleanup old messages (keep last 10000)
    if (db.messages.length > 10000) {
      const removed = db.messages.splice(0, 5000);
      removed.forEach(m => {
        db.messageIndex.delete(m.id);
        db.reactions.delete(m.id);
      });
      // Rebuild index
      db.messages.forEach((m, i) => db.messageIndex.set(m.id, i));
    }

    // Broadcast via WebSocket to online users
    broadcast({
      type: 'new_message',
      message: { ...newMessage, reactions: {}, threadCount: 0 }
    }, roomId);

    console.log(`[HTTP] Message in ${roomId} from ${req.user.username}: ${trimmedText.substring(0, 50)}`);

    res.json({ success: true, message: { ...newMessage, reactions: {}, threadCount: 0 } });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Search messages
app.get('/api/messages/search/:query', authMiddleware, (req, res) => {
  const { query } = req.params;
  const { roomId } = req.query;

  if (!query || query.trim().length < 2) {
    return res.status(400).json({ error: 'Search query must be at least 2 characters' });
  }

  let results = db.messages.filter(m => 
    m.text && m.text.toLowerCase().includes(query.toLowerCase())
  );

  if (roomId) {
    results = results.filter(m => m.roomId === roomId);
  }

  res.json({ messages: results.slice(-100) });
});

// ============================================
// DIRECT MESSAGES (WITH POLLING SUPPORT)
// ============================================

// Get all DM conversations
app.get('/api/dm', authMiddleware, (req, res) => {
  const currentUserId = req.user.id;
  const conversations = [];

  db.directMessages.forEach((messages, conversationId) => {
    if (conversationId.startsWith('dm_')) {
      const parts = conversationId.split('_');
      const odId1 = parts[1];
      const odId2 = parts[2];
      
      if (odId1 !== currentUserId && odId2 !== currentUserId) return;
      
      const otherUserId = odId1 === currentUserId ? odId2 : odId1;
      const otherUser = db.users.get(otherUserId);
      
      if (otherUser) {
        const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
        const unreadCount = messages.filter(m => m.userId !== currentUserId && !m.read).length;
        
        conversations.push({
          conversationId,
          participant: sanitizeUser(otherUser),
          lastMessage,
          unreadCount
        });
      }
    }
  });

  conversations.sort((a, b) => {
    if (!a.lastMessage) return 1;
    if (!b.lastMessage) return -1;
    return new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt);
  });

  res.json({ conversations });
});

// Get DM messages (supports polling with "since" parameter)
app.get('/api/dm/:userId', authMiddleware, (req, res) => {
  const currentUserId = req.user.id;
  const otherUserId = req.params.userId;
  const { since } = req.query;

  if (currentUserId === otherUserId) {
    return res.status(400).json({ error: 'Cannot DM yourself' });
  }

  const otherUser = db.users.get(otherUserId);
  if (!otherUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  const participants = [currentUserId, otherUserId].sort();
  const conversationId = `dm_${participants[0]}_${participants[1]}`;

  if (!db.directMessages.has(conversationId)) {
    db.directMessages.set(conversationId, []);
  }

  let messages = db.directMessages.get(conversationId);

  // If "since" is provided, only return messages after that ID
  if (since) {
    const sinceSeq = getMessageSequence(since);
    messages = messages.filter(m => getMessageSequence(m.id) > sinceSeq);
  } else {
    messages = messages.slice(-50);
  }

  // Mark as read
  messages.forEach(m => {
    if (m.userId !== currentUserId) m.read = true;
  });

  res.json({
    conversationId,
    participant: sanitizeUser(otherUser),
    messages,
    lastMessageId: messages.length > 0 ? messages[messages.length - 1].id : since || null
  });
});

// Send DM
app.post('/api/dm/:userId', authMiddleware, (req, res) => {
  try {
    const currentUser = req.user;
    const otherUserId = req.params.userId;
    const { text, attachment } = req.body;

    const trimmedText = text ? String(text).trim() : '';
    const hasText = trimmedText.length > 0;
    const hasAttachment = attachment && attachment.url;

    if (!hasText && !hasAttachment) {
      return res.status(400).json({ error: 'Message text or attachment required' });
    }

    if (currentUser.id === otherUserId) {
      return res.status(400).json({ error: 'Cannot send DM to yourself' });
    }

    const otherUser = db.users.get(otherUserId);
    if (!otherUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const participants = [currentUser.id, otherUserId].sort();
    const conversationId = `dm_${participants[0]}_${participants[1]}`;

    if (!db.directMessages.has(conversationId)) {
      db.directMessages.set(conversationId, []);
    }

    const messageId = generateDMMessageId();
    const newMessage = {
      id: messageId,
      conversationId,
      userId: currentUser.id,
      username: currentUser.username,
      displayName: currentUser.displayName,
      avatar: currentUser.avatar,
      text: trimmedText,
      attachment: hasAttachment ? attachment : null,
      read: false,
      createdAt: formatDate(new Date())
    };

    db.directMessages.get(conversationId).push(newMessage);

    // Cleanup old DMs
    const dmMessages = db.directMessages.get(conversationId);
    if (dmMessages.length > 1000) {
      db.directMessages.set(conversationId, dmMessages.slice(-500));
    }

    // Broadcast to recipient via WebSocket
    broadcastToUser(otherUserId, {
      type: 'dm_received',
      conversationId,
      message: newMessage
    });

    console.log(`[HTTP] DM from ${currentUser.username} to ${otherUser.username}`);

    res.json({ success: true, message: newMessage });
  } catch (error) {
    console.error('Send DM error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Mark DM as read
app.put('/api/dm/:conversationId/read', authMiddleware, (req, res) => {
  const conversationId = req.params.conversationId;
  
  if (db.directMessages.has(conversationId)) {
    const messages = db.directMessages.get(conversationId);
    messages.forEach(m => {
      if (m.userId !== req.user.id) m.read = true;
    });
  }

  res.json({ success: true });
});

// ============================================
// POLLING ENDPOINT - GET ALL UPDATES
// ============================================
app.get('/api/sync', authMiddleware, (req, res) => {
  try {
    const { lastRoomMessageId, lastDMCheck, roomId } = req.query;
    const currentUserId = req.user.id;

    const response = {
      roomMessages: [],
      dmMessages: [],
      onlineUsers: getOnlineUsers(),
      timestamp: Date.now()
    };

    // Get new room messages
    if (roomId) {
      let roomMessages = db.messages.filter(m => m.roomId === roomId);
      
      if (lastRoomMessageId) {
        const sinceSeq = getMessageSequence(lastRoomMessageId);
        roomMessages = roomMessages.filter(m => getMessageSequence(m.id) > sinceSeq);
      }

      response.roomMessages = roomMessages.map(m => ({
        ...m,
        reactions: db.reactions.get(m.id) || {},
        threadCount: db.threads.has(m.id) ? db.threads.get(m.id).messages.length : 0
      }));

      response.lastRoomMessageId = response.roomMessages.length > 0 
        ? response.roomMessages[response.roomMessages.length - 1].id 
        : lastRoomMessageId;
    }

    // Get new DM messages across all conversations
    const lastDMTime = lastDMCheck ? parseInt(lastDMCheck) : 0;
    
    db.directMessages.forEach((messages, conversationId) => {
      if (!conversationId.includes(currentUserId)) return;

      const newMessages = messages.filter(m => {
        const msgTime = new Date(m.createdAt).getTime();
        return msgTime > lastDMTime && m.userId !== currentUserId;
      });

      if (newMessages.length > 0) {
        response.dmMessages.push({
          conversationId,
          messages: newMessages
        });
      }
    });

    res.json(response);
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: 'Sync failed' });
  }
});

// ============================================
// THREAD ROUTES
// ============================================
app.get('/api/threads/:messageId', authMiddleware, (req, res) => {
  const messageId = req.params.messageId;
  const msgIndex = db.messageIndex.get(messageId);
  const parentMessage = msgIndex !== undefined ? db.messages[msgIndex] : null;

  if (!parentMessage) {
    return res.status(404).json({ error: 'Parent message not found' });
  }

  const thread = db.threads.get(messageId) || { parentMessageId: messageId, messages: [] };

  res.json({
    parentMessage: {
      ...parentMessage,
      reactions: db.reactions.get(parentMessage.id) || {}
    },
    replies: thread.messages.map(m => ({
      ...m,
      reactions: db.reactions.get(m.id) || {}
    }))
  });
});

app.post('/api/threads/:messageId', authMiddleware, (req, res) => {
  const parentMessageId = req.params.messageId;
  const { text, attachment } = req.body;

  const trimmedText = text ? String(text).trim() : '';
  if (!trimmedText && !(attachment && attachment.url)) {
    return res.status(400).json({ error: 'Reply text or attachment required' });
  }

  const msgIndex = db.messageIndex.get(parentMessageId);
  const parentMessage = msgIndex !== undefined ? db.messages[msgIndex] : null;

  if (!parentMessage) {
    return res.status(404).json({ error: 'Parent message not found' });
  }

  if (!db.threads.has(parentMessageId)) {
    db.threads.set(parentMessageId, { parentMessageId, messages: [] });
  }

  const messageId = generateMessageId();
  const replyMessage = {
    id: messageId,
    parentMessageId,
    userId: req.user.id,
    username: req.user.username,
    displayName: req.user.displayName,
    avatar: req.user.avatar,
    text: trimmedText,
    attachment: attachment?.url ? attachment : null,
    edited: false,
    createdAt: formatDate(new Date())
  };

  db.threads.get(parentMessageId).messages.push(replyMessage);

  broadcast({
    type: 'thread_reply',
    parentMessageId,
    message: replyMessage
  }, parentMessage.roomId);

  res.json({ success: true, message: replyMessage });
});

// ============================================
// PIN ROUTES
// ============================================
app.get('/api/rooms/:roomId/pins', authMiddleware, (req, res) => {
  const roomId = req.params.roomId;
  const pinnedIds = db.pinnedMessages.get(roomId) || [];

  const pinnedMessages = pinnedIds
    .map(id => {
      const idx = db.messageIndex.get(id);
      return idx !== undefined ? db.messages[idx] : null;
    })
    .filter(m => m !== null)
    .map(m => ({
      ...m,
      reactions: db.reactions.get(m.id) || {}
    }));

  res.json({ pinnedMessages });
});

app.post('/api/rooms/:roomId/pin', authMiddleware, (req, res) => {
  const { messageId } = req.body;
  const roomId = req.params.roomId;

  if (!messageId) {
    return res.status(400).json({ error: 'Message ID required' });
  }

  const msgIndex = db.messageIndex.get(messageId);
  const message = msgIndex !== undefined ? db.messages[msgIndex] : null;

  if (!message || message.roomId !== roomId) {
    return res.status(404).json({ error: 'Message not found in this room' });
  }

  if (!db.pinnedMessages.has(roomId)) {
    db.pinnedMessages.set(roomId, []);
  }

  const pinned = db.pinnedMessages.get(roomId);
  
  if (pinned.includes(messageId)) {
    return res.status(400).json({ error: 'Message already pinned' });
  }

  if (pinned.length >= 50) {
    return res.status(400).json({ error: 'Maximum pinned messages reached' });
  }

  pinned.push(messageId);

  broadcast({
    type: 'message_pinned',
    roomId,
    messageId,
    pinnedBy: req.user.id
  }, roomId);

  res.json({ success: true });
});

app.delete('/api/rooms/:roomId/pin/:messageId', authMiddleware, (req, res) => {
  const { roomId, messageId } = req.params;

  if (db.pinnedMessages.has(roomId)) {
    const pinned = db.pinnedMessages.get(roomId);
    const index = pinned.indexOf(messageId);
    if (index > -1) {
      pinned.splice(index, 1);
      broadcast({
        type: 'message_unpinned',
        roomId,
        messageId
      }, roomId);
    }
  }

  res.json({ success: true });
});

// ============================================
// STATS
// ============================================
app.get('/api/stats', (req, res) => {
  res.json({
    totalUsers: db.users.size,
    onlineUsers: getOnlineUsers().length,
    totalMessages: db.messages.length,
    totalRooms: db.rooms.size,
    uptime: process.uptime()
  });
});

// ============================================
// ERROR HANDLING
// ============================================
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: 'File upload error: ' + err.message });
  }
  res.status(500).json({ error: 'Internal server error' });
});

app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// ============================================
// WEBSOCKET HANDLING
// ============================================
wss.on('connection', (ws, req) => {
  const connectionId = uuidv4();
  let currentUser = null;
  let currentRoom = 'general';
  let typingTimeout = null;

  console.log(`[WS] New connection: ${connectionId}`);

  ws.send(JSON.stringify({ type: 'connected', connectionId }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleWebSocketMessage(data);
    } catch (error) {
      console.error('[WS] Message error:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  function handleWebSocketMessage(data) {
    switch (data.type) {
      case 'auth':
        handleAuth(data);
        break;
      case 'join_room':
        handleJoinRoom(data);
        break;
      case 'leave_room':
        handleLeaveRoom(data);
        break;
      case 'message':
        handleMessage(data);
        break;
      case 'edit_message':
        handleEditMessage(data);
        break;
      case 'delete_message':
        handleDeleteMessage(data);
        break;
      case 'reaction':
        handleReaction(data);
        break;
      case 'typing':
        handleTyping(data);
        break;
      case 'status_change':
        handleStatusChange(data);
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
    }
  }

  function handleAuth(data) {
    const session = db.sessions.get(data.token);
    if (!session) {
      ws.send(JSON.stringify({ type: 'auth_error', message: 'Invalid session' }));
      return;
    }

    const user = db.users.get(session.userId);
    if (!user) {
      ws.send(JSON.stringify({ type: 'auth_error', message: 'User not found' }));
      return;
    }

    currentUser = user;
    user.lastSeen = formatDate(new Date());

    connections.set(connectionId, {
      ws,
      user: sanitizeUser(user),
      status: 'online',
      currentRoom
    });

    ws.send(JSON.stringify({
      type: 'auth_success',
      user: sanitizeUser(user),
      rooms: Array.from(db.rooms.values()),
      onlineUsers: getOnlineUsers()
    }));

    broadcast({
      type: 'user_status_change',
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      status: 'online',
      avatar: user.avatar
    }, null, user.id);

    console.log(`[WS] Authenticated: ${user.username}`);
  }

  function handleJoinRoom(data) {
    if (!currentUser) return;

    currentRoom = data.roomId;

    if (!db.rooms.has(currentRoom)) {
      ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
      return;
    }

    const conn = connections.get(connectionId);
    if (conn) conn.currentRoom = currentRoom;

    let messages = db.messages.filter(m => m.roomId === currentRoom).slice(-50);
    messages = messages.map(m => ({
      ...m,
      reactions: db.reactions.get(m.id) || {},
      threadCount: db.threads.has(m.id) ? db.threads.get(m.id).messages.length : 0
    }));

    const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;

    ws.send(JSON.stringify({
      type: 'room_joined',
      roomId: currentRoom,
      messages,
      lastMessageId,
      pinnedMessages: db.pinnedMessages.get(currentRoom) || []
    }));

    broadcast({
      type: 'user_joined_room',
      roomId: currentRoom,
      user: sanitizeUser(currentUser)
    }, currentRoom, currentUser.id);

    console.log(`[WS] ${currentUser.username} joined: ${currentRoom}`);
  }

  function handleLeaveRoom(data) {
    if (!currentUser) return;

    broadcast({
      type: 'user_left_room',
      roomId: data.roomId,
      user: sanitizeUser(currentUser)
    }, data.roomId, currentUser.id);
  }

  function handleMessage(data) {
    if (!currentUser) {
      ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
      return;
    }

    const trimmedText = data.text ? String(data.text).trim() : '';
    const hasAttachment = data.attachment && data.attachment.url;

    if (!trimmedText && !hasAttachment) {
      ws.send(JSON.stringify({ type: 'error', message: 'Message required' }));
      return;
    }

    const messageId = generateMessageId();
    const newMessage = {
      id: messageId,
      roomId: data.roomId || currentRoom,
      userId: currentUser.id,
      username: currentUser.username,
      displayName: currentUser.displayName,
      avatar: currentUser.avatar,
      text: trimmedText,
      attachment: hasAttachment ? data.attachment : null,
      replyTo: data.replyTo || null,
      edited: false,
      createdAt: formatDate(new Date())
    };

    db.messages.push(newMessage);
    db.messageIndex.set(messageId, db.messages.length - 1);

    // Cleanup old messages
    if (db.messages.length > 10000) {
      const removed = db.messages.splice(0, 5000);
      removed.forEach(m => {
        db.messageIndex.delete(m.id);
        db.reactions.delete(m.id);
      });
      db.messages.forEach((m, i) => db.messageIndex.set(m.id, i));
    }

    broadcast({
      type: 'new_message',
      message: { ...newMessage, reactions: {}, threadCount: 0 }
    }, newMessage.roomId);

    console.log(`[WS] Message in ${newMessage.roomId} from ${currentUser.username}`);
  }

  function handleEditMessage(data) {
    if (!currentUser) return;

    const msgIndex = db.messageIndex.get(data.messageId);
    const message = msgIndex !== undefined ? db.messages[msgIndex] : null;

    if (!message || message.userId !== currentUser.id) {
      ws.send(JSON.stringify({ type: 'error', message: 'Cannot edit this message' }));
      return;
    }

    const trimmedText = data.text ? String(data.text).trim() : '';
    if (!trimmedText) {
      ws.send(JSON.stringify({ type: 'error', message: 'Message text required' }));
      return;
    }

    message.text = trimmedText;
    message.edited = true;
    message.editedAt = formatDate(new Date());

    broadcast({
      type: 'message_edited',
      messageId: message.id,
      text: message.text,
      editedAt: message.editedAt
    }, message.roomId);
  }

  function handleDeleteMessage(data) {
    if (!currentUser) return;

    const msgIndex = db.messageIndex.get(data.messageId);
    const message = msgIndex !== undefined ? db.messages[msgIndex] : null;

    if (!message || message.userId !== currentUser.id) {
      ws.send(JSON.stringify({ type: 'error', message: 'Cannot delete this message' }));
      return;
    }

    const roomId = message.roomId;

    // Remove message
    db.messages.splice(msgIndex, 1);
    db.messageIndex.delete(data.messageId);
    db.reactions.delete(data.messageId);
    db.threads.delete(data.messageId);

    // Rebuild index
    db.messages.forEach((m, i) => db.messageIndex.set(m.id, i));

    // Remove from pinned
    if (db.pinnedMessages.has(roomId)) {
      const pinned = db.pinnedMessages.get(roomId);
      const idx = pinned.indexOf(data.messageId);
      if (idx > -1) pinned.splice(idx, 1);
    }

    broadcast({
      type: 'message_deleted',
      messageId: data.messageId,
      roomId
    }, roomId);
  }

  function handleReaction(data) {
    if (!currentUser) return;

    const { messageId, emoji } = data;
    if (!messageId || !emoji) return;
    
    if (!db.reactions.has(messageId)) {
      db.reactions.set(messageId, {});
    }

    const reactions = db.reactions.get(messageId);
    
    if (!reactions[emoji]) {
      reactions[emoji] = [];
    }

    const userIndex = reactions[emoji].indexOf(currentUser.id);
    if (userIndex > -1) {
      reactions[emoji].splice(userIndex, 1);
      if (reactions[emoji].length === 0) delete reactions[emoji];
    } else {
      reactions[emoji].push(currentUser.id);
    }

    const msgIndex = db.messageIndex.get(messageId);
    const message = msgIndex !== undefined ? db.messages[msgIndex] : null;
    const roomId = message?.roomId || currentRoom;

    broadcast({
      type: 'reaction_updated',
      messageId,
      reactions,
      roomId
    }, roomId);
  }

  function handleTyping(data) {
    if (!currentUser) return;

    clearTimeout(typingTimeout);

    broadcast({
      type: 'user_typing',
      userId: currentUser.id,
      username: currentUser.displayName || currentUser.username,
      roomId: currentRoom,
      isTyping: data.isTyping
    }, currentRoom, currentUser.id);

    if (data.isTyping) {
      typingTimeout = setTimeout(() => {
        broadcast({
          type: 'user_typing',
          userId: currentUser.id,
          username: currentUser.displayName || currentUser.username,
          roomId: currentRoom,
          isTyping: false
        }, currentRoom, currentUser.id);
      }, 3000);
    }
  }

  function handleStatusChange(data) {
    if (!currentUser) return;

    const validStatuses = ['online', 'away', 'dnd', 'invisible'];
    if (!validStatuses.includes(data.status)) return;

    const conn = connections.get(connectionId);
    if (conn) conn.status = data.status;

    broadcast({
      type: 'user_status_change',
      userId: currentUser.id,
      username: currentUser.username,
      displayName: currentUser.displayName,
      status: data.status,
      avatar: currentUser.avatar
    }, null, currentUser.id);
  }

  ws.on('close', () => {
    clearTimeout(typingTimeout);
    connections.delete(connectionId);

    if (currentUser) {
      currentUser.lastSeen = formatDate(new Date());
      
      let hasOtherConnections = false;
      connections.forEach((conn) => {
        if (conn.user?.id === currentUser.id) hasOtherConnections = true;
      });

      if (!hasOtherConnections) {
        broadcast({
          type: 'user_status_change',
          userId: currentUser.id,
          username: currentUser.username,
          displayName: currentUser.displayName,
          status: 'offline',
          avatar: currentUser.avatar
        });
      }

      console.log(`[WS] Disconnected: ${currentUser.username}`);
    }
  });

  ws.on('error', (error) => {
    console.error('[WS] Error:', error);
  });
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  connections.forEach((conn) => {
    if (conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.close(1001, 'Server shutting down');
    }
  });
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('Shutting down...');
  connections.forEach((conn) => {
    if (conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.close(1001, 'Server shutting down');
    }
  });
  server.close(() => process.exit(0));
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════╗
║       🚀 ChatHub Server with Polling Support       ║
╠═══════════════════════════════════════════════════╣
║  HTTP:      http://localhost:${PORT}                  ║
║  WebSocket: ws://localhost:${PORT}                    ║
║  Polling:   GET /api/sync                          ║
║  Status:    Ready                                  ║
╚═══════════════════════════════════════════════════╝
  `);
});