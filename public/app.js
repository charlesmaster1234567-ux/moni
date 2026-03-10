// ============================================
// CHATHUB - REAL-TIME CHAT APPLICATION
// Enhanced with Admin/Master Features, More Themes & Improved Avatars
// ============================================

// ============================================
// CONSTANTS & CONFIGURATION
// ============================================
const CONFIG = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_AVATAR_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_AVATAR_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  ALLOWED_AVATAR_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
  POLL_INTERVAL: 2000,
  MAX_RECONNECT_ATTEMPTS: 5,
  PING_INTERVAL: 30000,
  MESSAGE_CACHE_LIMIT: 100,
  THEMES: ['dark', 'light', 'midnight', 'nature', 'sunset', 'ocean', 'forest', 'cherry', 'cyberpunk', 'lavender', 'mocha', 'arctic', 'volcano', 'galaxy', 'retro'],
  USER_ROLES: {
    MASTER: 'master',
    ADMIN: 'admin',
    MODERATOR: 'moderator',
    MEMBER: 'member'
  }
};

// ============================================
// POLLING SERVICE - Syncs messages when WebSocket is down
// ============================================
class PollingService {
  constructor(app) {
    this.app = app;
    this.pollInterval = null;
    this.pollIntervalMs = CONFIG.POLL_INTERVAL;
    this.isPolling = false;
    this.lastRoomMessageId = null;
    this.lastDMCheck = 0;
    this.enabled = false;
    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = 5;
    
    // Offline support
    this.offlineQueue = [];
    this.isOnline = navigator.onLine;
    this.initOfflineSupport();
  }

  initOfflineSupport() {
    const stored = localStorage.getItem('offlineMessageQueue');
    if (stored) {
      try {
        this.offlineQueue = JSON.parse(stored);
        console.log(`[Offline] Loaded ${this.offlineQueue.length} queued messages`);
      } catch (e) {
        console.error('[Offline] Failed to load queue:', e);
        this.offlineQueue = [];
      }
    }

    window.addEventListener('online', () => {
      console.log('[Offline] Connection restored - syncing queued messages');
      this.isOnline = true;
      this.app.showToast('Back online - syncing messages...', 'success');
      this.syncOfflineMessages();
    });

    window.addEventListener('offline', () => {
      console.log('[Offline] Connection lost - entering offline mode');
      this.isOnline = false;
      this.app.updateConnectionStatus('offline');
      this.app.showToast('You are offline - messages will be sent when reconnected', 'warning');
    });
  }

  queueOfflineMessage(message) {
    const queuedMessage = {
      ...message,
      id: 'temp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
      queuedAt: Date.now(),
      status: 'queued'
    };
    
    this.offlineQueue.push(queuedMessage);
    this.saveOfflineQueue();
    
    console.log('[Offline] Message queued:', queuedMessage.id);
    return queuedMessage;
  }

  saveOfflineQueue() {
    try {
      localStorage.setItem('offlineMessageQueue', JSON.stringify(this.offlineQueue));
    } catch (e) {
      console.error('[Offline] Failed to save queue:', e);
    }
  }

  async syncOfflineMessages() {
    if (this.offlineQueue.length === 0) {
      console.log('[Offline] No queued messages to sync');
      return;
    }
    
    console.log(`[Offline] Syncing ${this.offlineQueue.length} queued messages...`);
    
    const messages = [...this.offlineQueue];
    this.offlineQueue = [];
    this.saveOfflineQueue();
    
    let successCount = 0;
    let failCount = 0;
    
    for (const message of messages) {
      try {
        if (message.isDM) {
          await this.app.syncDMMessageToServer(message);
        } else {
          await this.app.syncMessageToServer(message);
        }
        successCount++;
        console.log('[Offline] Synced message:', message.id);
        this.app.markMessageAsSent(message.id);
      } catch (error) {
        console.error('[Offline] Failed to sync message:', error);
        failCount++;
        this.offlineQueue.push(message);
      }
    }
    
    this.saveOfflineQueue();
    
    if (successCount > 0) {
      this.app.showToast(`${successCount} message(s) sent successfully!`, 'success');
    }
    if (failCount > 0) {
      this.app.showToast(`${failCount} message(s) failed - will retry`, 'warning');
    }
  }

  getQueuedCount() {
    return this.offlineQueue.length;
  }

  clearQueue() {
    this.offlineQueue = [];
    this.saveOfflineQueue();
  }

  start() {
    if (this.pollInterval) return;
    
    this.enabled = true;
    this.consecutiveErrors = 0;
    console.log('[Polling] Starting polling service (interval: ' + this.pollIntervalMs + 'ms)');
    
    this.pollInterval = setInterval(() => {
      this.poll();
    }, this.pollIntervalMs);

    setTimeout(() => this.poll(), 1000);
  }

  stop() {
    this.enabled = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    console.log('[Polling] Stopped polling service');
  }

  async poll() {
    if (this.app.ws && this.app.ws.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.isPolling || !this.app.token) return;

    if (!navigator.onLine) {
      console.log('[Polling] Skipping poll - offline');
      return;
    }

    if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
      console.log('[Polling] Too many errors, pausing...');
      return;
    }
    
    this.isPolling = true;

    try {
      const params = new URLSearchParams({
        roomId: this.app.currentRoom,
        lastDMCheck: this.lastDMCheck.toString()
      });

      if (this.lastRoomMessageId) {
        params.set('lastRoomMessageId', this.lastRoomMessageId);
      }

      const response = await this.app.apiRequest(`/api/sync?${params}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.app.token}` }
      });

      if (response.error) {
        console.error('[Polling] Error:', response.error);
        this.consecutiveErrors++;
        return;
      }

      this.consecutiveErrors = 0;

      if (response.roomMessages && response.roomMessages.length > 0) {
        console.log(`[Polling] Got ${response.roomMessages.length} new room messages`);
        
        for (const message of response.roomMessages) {
          this.app.handleNewMessage(message);
        }
      }

      if (response.lastRoomMessageId) {
        this.lastRoomMessageId = response.lastRoomMessageId;
      }

      if (response.dmMessages && response.dmMessages.length > 0) {
        console.log(`[Polling] Got ${response.dmMessages.length} new DM conversations with messages`);
        
        for (const conv of response.dmMessages) {
          for (const message of conv.messages) {
            this.app.handleDMReceived({
              conversationId: conv.conversationId,
              message
            });
          }
        }
      }

      this.lastDMCheck = response.timestamp || Date.now();

      if (response.onlineUsers) {
        this.app.onlineUsers = new Map(response.onlineUsers.map(u => [u.id, u]));
        this.app.updateUsersList();
        this.app.renderDMList();
      }

    } catch (error) {
      console.error('[Polling] Error:', error);
      this.consecutiveErrors++;
    } finally {
      this.isPolling = false;
    }
  }

  setRoom(roomId, lastMessageId = null) {
    this.lastRoomMessageId = lastMessageId;
    console.log(`[Polling] Room set to ${roomId}, lastMessageId: ${lastMessageId}`);
  }

  reset() {
    this.lastRoomMessageId = null;
    this.lastDMCheck = 0;
    this.consecutiveErrors = 0;
  }

  setInterval(ms) {
    this.pollIntervalMs = ms;
    if (this.pollInterval) {
      this.stop();
      this.start();
    }
  }
}

// ============================================
// AVATAR SERVICE - Handles multiple image formats
// ============================================
class AvatarService {
  constructor() {
    this.allowedTypes = CONFIG.ALLOWED_AVATAR_TYPES;
    this.maxSize = CONFIG.MAX_AVATAR_SIZE;
    this.defaultColors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
      '#F8B500', '#00D4AA', '#FF6F61', '#6B5B95', '#88B04B',
      '#E74C3C', '#3498DB', '#2ECC71', '#9B59B6', '#F39C12',
      '#1ABC9C', '#E91E63', '#00BCD4', '#FF5722', '#607D8B'
    ];
  }

  validateFile(file) {
    const errors = [];

    if (!file) {
      errors.push('No file provided');
      return { valid: false, errors };
    }

    // Check file type
    if (!this.allowedTypes.includes(file.type)) {
      errors.push(`Invalid file type. Allowed: ${CONFIG.ALLOWED_AVATAR_EXTENSIONS.join(', ')}`);
    }

    // Check file size
    if (file.size > this.maxSize) {
      errors.push(`File too large. Maximum size: ${this.formatSize(this.maxSize)}`);
    }

    // Check file extension
    const extension = '.' + file.name.split('.').pop().toLowerCase();
    if (!CONFIG.ALLOWED_AVATAR_EXTENSIONS.includes(extension)) {
      errors.push(`Invalid file extension. Allowed: ${CONFIG.ALLOWED_AVATAR_EXTENSIONS.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  async compressImage(file, maxWidth = 256, maxHeight = 256, quality = 0.8) {
    return new Promise((resolve, reject) => {
      // Skip compression for SVG
      if (file.type === 'image/svg+xml') {
        resolve(file);
        return;
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        let { width, height } = img;

        // Calculate new dimensions
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width *= ratio;
          height *= ratio;
        }

        canvas.width = width;
        canvas.height = height;

        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: file.type === 'image/png' ? 'image/png' : 'image/jpeg',
                lastModified: Date.now()
              });
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          },
          file.type === 'image/png' ? 'image/png' : 'image/jpeg',
          quality
        );
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  }

  async createPreview(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  generateDefault(username, size = 100) {
    const color = this.defaultColors[(username || 'U').charCodeAt(0) % this.defaultColors.length];
    const initial = ((username || 'U')[0] || 'U').toUpperCase();

    return `data:image/svg+xml,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
        <rect width="${size}" height="${size}" fill="${color}"/>
        <text x="50%" y="50%" dy="0.35em" text-anchor="middle" 
              font-family="Arial, sans-serif" font-size="${size * 0.45}" font-weight="bold" fill="white">
          ${initial}
        </text>
      </svg>
    `)}`;
  }

  generateGradient(username, size = 100) {
    const colors = this.defaultColors;
    const index1 = (username || 'U').charCodeAt(0) % colors.length;
    const index2 = ((username || 'U').charCodeAt(1) || 0) % colors.length;
    const color1 = colors[index1];
    const color2 = colors[index2 !== index1 ? index2 : (index1 + 1) % colors.length];
    const initial = ((username || 'U')[0] || 'U').toUpperCase();

    return `data:image/svg+xml,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${color1}"/>
            <stop offset="100%" style="stop-color:${color2}"/>
          </linearGradient>
        </defs>
        <rect width="${size}" height="${size}" fill="url(#grad)"/>
        <text x="50%" y="50%" dy="0.35em" text-anchor="middle" 
              font-family="Arial, sans-serif" font-size="${size * 0.45}" font-weight="bold" fill="white">
          ${initial}
        </text>
      </svg>
    `)}`;
  }
}

// ============================================
// ADMIN SERVICE - Handles admin & master operations
// ============================================
class AdminService {
  constructor(app) {
    this.app = app;
  }

  // Check if current user is master
  isMaster() {
    return this.app.user?.role === CONFIG.USER_ROLES.MASTER;
  }

  // Check if current user is admin of a room
  isRoomAdmin(roomId) {
    const room = this.app.rooms.find(r => r.id === roomId);
    if (!room) return false;
    return room.adminIds?.includes(this.app.user?.id) || this.isMaster();
  }

  // Check if current user is moderator of a room
  isRoomModerator(roomId) {
    const room = this.app.rooms.find(r => r.id === roomId);
    if (!room) return false;
    return room.moderatorIds?.includes(this.app.user?.id) || this.isRoomAdmin(roomId);
  }

  // Check if user can manage another user
  canManageUser(targetUserId) {
    if (this.isMaster()) return true;
    if (targetUserId === this.app.user?.id) return false;
    
    const targetUser = this.app.onlineUsers.get(targetUserId);
    if (!targetUser) return false;
    
    // Admins can manage non-admin users
    if (this.app.user?.role === CONFIG.USER_ROLES.ADMIN) {
      return targetUser.role !== CONFIG.USER_ROLES.MASTER && targetUser.role !== CONFIG.USER_ROLES.ADMIN;
    }
    
    return false;
  }

  // Get permission level
  getPermissionLevel(role) {
    const levels = {
      [CONFIG.USER_ROLES.MASTER]: 4,
      [CONFIG.USER_ROLES.ADMIN]: 3,
      [CONFIG.USER_ROLES.MODERATOR]: 2,
      [CONFIG.USER_ROLES.MEMBER]: 1
    };
    return levels[role] || 0;
  }

  // ============================================
  // MASTER FUNCTIONS
  // ============================================
  
  async deleteAnyMessage(messageId, roomId) {
    if (!this.isMaster() && !this.isRoomModerator(roomId)) {
      this.app.showToast('Permission denied', 'error');
      return false;
    }

    try {
      const response = await this.app.apiRequest(`/api/admin/messages/${messageId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${this.app.token}` },
        body: JSON.stringify({ roomId, force: this.isMaster() })
      });

      if (response.success) {
        this.app.showToast('Message deleted', 'success');
        return true;
      } else {
        this.app.showToast(response.error || 'Failed to delete message', 'error');
        return false;
      }
    } catch (error) {
      console.error('Delete message error:', error);
      this.app.showToast('Failed to delete message', 'error');
      return false;
    }
  }

  async banUser(userId, reason = '', duration = null) {
    if (!this.isMaster() && !this.app.user?.role === CONFIG.USER_ROLES.ADMIN) {
      this.app.showToast('Permission denied', 'error');
      return false;
    }

    try {
      const response = await this.app.apiRequest(`/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.app.token}` },
        body: JSON.stringify({ reason, duration })
      });

      if (response.success) {
        this.app.showToast(`User banned${duration ? ` for ${duration}` : ' permanently'}`, 'success');
        return true;
      } else {
        this.app.showToast(response.error || 'Failed to ban user', 'error');
        return false;
      }
    } catch (error) {
      console.error('Ban user error:', error);
      this.app.showToast('Failed to ban user', 'error');
      return false;
    }
  }

  async unbanUser(userId) {
    if (!this.isMaster() && !this.app.user?.role === CONFIG.USER_ROLES.ADMIN) {
      this.app.showToast('Permission denied', 'error');
      return false;
    }

    try {
      const response = await this.app.apiRequest(`/api/admin/users/${userId}/unban`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.app.token}` }
      });

      if (response.success) {
        this.app.showToast('User unbanned', 'success');
        return true;
      } else {
        this.app.showToast(response.error || 'Failed to unban user', 'error');
        return false;
      }
    } catch (error) {
      console.error('Unban user error:', error);
      this.app.showToast('Failed to unban user', 'error');
      return false;
    }
  }

  async deleteUserAccount(userId) {
    if (!this.isMaster()) {
      this.app.showToast('Only master can delete accounts', 'error');
      return false;
    }

    try {
      const response = await this.app.apiRequest(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${this.app.token}` }
      });

      if (response.success) {
        this.app.showToast('User account deleted', 'success');
        this.app.onlineUsers.delete(userId);
        this.app.updateUsersList();
        return true;
      } else {
        this.app.showToast(response.error || 'Failed to delete account', 'error');
        return false;
      }
    } catch (error) {
      console.error('Delete account error:', error);
      this.app.showToast('Failed to delete account', 'error');
      return false;
    }
  }

  async modifyUserProfile(userId, updates) {
    if (!this.isMaster()) {
      this.app.showToast('Only master can modify profiles', 'error');
      return false;
    }

    try {
      const response = await this.app.apiRequest(`/api/admin/users/${userId}/profile`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${this.app.token}` },
        body: JSON.stringify(updates)
      });

      if (response.success) {
        this.app.showToast('User profile updated', 'success');
        return true;
      } else {
        this.app.showToast(response.error || 'Failed to update profile', 'error');
        return false;
      }
    } catch (error) {
      console.error('Modify profile error:', error);
      this.app.showToast('Failed to update profile', 'error');
      return false;
    }
  }

  async setUserRole(userId, role) {
    if (!this.isMaster()) {
      this.app.showToast('Only master can change roles', 'error');
      return false;
    }

    try {
      const response = await this.app.apiRequest(`/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${this.app.token}` },
        body: JSON.stringify({ role })
      });

      if (response.success) {
        this.app.showToast(`User role changed to ${role}`, 'success');
        const user = this.app.onlineUsers.get(userId);
        if (user) {
          user.role = role;
          this.app.updateUsersList();
        }
        return true;
      } else {
        this.app.showToast(response.error || 'Failed to change role', 'error');
        return false;
      }
    } catch (error) {
      console.error('Set role error:', error);
      this.app.showToast('Failed to change role', 'error');
      return false;
    }
  }

  async sendSystemAnnouncement(message, targetRooms = []) {
    if (!this.isMaster() && this.app.user?.role !== CONFIG.USER_ROLES.ADMIN) {
      this.app.showToast('Permission denied', 'error');
      return false;
    }

    try {
      const response = await this.app.apiRequest('/api/admin/announcement', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.app.token}` },
        body: JSON.stringify({ message, targetRooms })
      });

      if (response.success) {
        this.app.showToast('Announcement sent', 'success');
        return true;
      } else {
        this.app.showToast(response.error || 'Failed to send announcement', 'error');
        return false;
      }
    } catch (error) {
      console.error('Announcement error:', error);
      this.app.showToast('Failed to send announcement', 'error');
      return false;
    }
  }

  async getAllUsers(page = 1, limit = 50, search = '') {
    if (!this.isMaster() && this.app.user?.role !== CONFIG.USER_ROLES.ADMIN) {
      return { users: [], total: 0 };
    }

    try {
      const params = new URLSearchParams({ page, limit, search });
      const response = await this.app.apiRequest(`/api/admin/users?${params}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.app.token}` }
      });

      return response;
    } catch (error) {
      console.error('Get users error:', error);
      return { users: [], total: 0 };
    }
  }

  async getBannedUsers() {
    if (!this.isMaster() && this.app.user?.role !== CONFIG.USER_ROLES.ADMIN) {
      return [];
    }

    try {
      const response = await this.app.apiRequest('/api/admin/users/banned', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.app.token}` }
      });

      return response.users || [];
    } catch (error) {
      console.error('Get banned users error:', error);
      return [];
    }
  }

  async getSystemStats() {
    if (!this.isMaster()) {
      return null;
    }

    try {
      const response = await this.app.apiRequest('/api/admin/stats', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.app.token}` }
      });

      return response;
    } catch (error) {
      console.error('Get stats error:', error);
      return null;
    }
  }

  // ============================================
  // CHANNEL ADMIN FUNCTIONS
  // ============================================

  async kickUserFromRoom(userId, roomId) {
    if (!this.isRoomModerator(roomId)) {
      this.app.showToast('Permission denied', 'error');
      return false;
    }

    try {
      const response = await this.app.apiRequest(`/api/rooms/${roomId}/kick`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.app.token}` },
        body: JSON.stringify({ userId })
      });

      if (response.success) {
        this.app.showToast('User kicked from channel', 'success');
        return true;
      } else {
        this.app.showToast(response.error || 'Failed to kick user', 'error');
        return false;
      }
    } catch (error) {
      console.error('Kick user error:', error);
      this.app.showToast('Failed to kick user', 'error');
      return false;
    }
  }

  async muteUserInRoom(userId, roomId, duration = 60) {
    if (!this.isRoomModerator(roomId)) {
      this.app.showToast('Permission denied', 'error');
      return false;
    }

    try {
      const response = await this.app.apiRequest(`/api/rooms/${roomId}/mute`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.app.token}` },
        body: JSON.stringify({ userId, duration })
      });

      if (response.success) {
        this.app.showToast(`User muted for ${duration} minutes`, 'success');
        return true;
      } else {
        this.app.showToast(response.error || 'Failed to mute user', 'error');
        return false;
      }
    } catch (error) {
      console.error('Mute user error:', error);
      this.app.showToast('Failed to mute user', 'error');
      return false;
    }
  }

  async unmuteUserInRoom(userId, roomId) {
    if (!this.isRoomModerator(roomId)) {
      this.app.showToast('Permission denied', 'error');
      return false;
    }

    try {
      const response = await this.app.apiRequest(`/api/rooms/${roomId}/unmute`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.app.token}` },
        body: JSON.stringify({ userId })
      });

      if (response.success) {
        this.app.showToast('User unmuted', 'success');
        return true;
      } else {
        this.app.showToast(response.error || 'Failed to unmute user', 'error');
        return false;
      }
    } catch (error) {
      console.error('Unmute user error:', error);
      this.app.showToast('Failed to unmute user', 'error');
      return false;
    }
  }

  async setRoomModerator(userId, roomId) {
    if (!this.isRoomAdmin(roomId)) {
      this.app.showToast('Only admins can set moderators', 'error');
      return false;
    }

    try {
      const response = await this.app.apiRequest(`/api/rooms/${roomId}/moderators`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.app.token}` },
        body: JSON.stringify({ userId })
      });

      if (response.success) {
        this.app.showToast('User is now a moderator', 'success');
        return true;
      } else {
        this.app.showToast(response.error || 'Failed to set moderator', 'error');
        return false;
      }
    } catch (error) {
      console.error('Set moderator error:', error);
      this.app.showToast('Failed to set moderator', 'error');
      return false;
    }
  }

  async removeRoomModerator(userId, roomId) {
    if (!this.isRoomAdmin(roomId)) {
      this.app.showToast('Only admins can remove moderators', 'error');
      return false;
    }

    try {
      const response = await this.app.apiRequest(`/api/rooms/${roomId}/moderators/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${this.app.token}` }
      });

      if (response.success) {
        this.app.showToast('Moderator removed', 'success');
        return true;
      } else {
        this.app.showToast(response.error || 'Failed to remove moderator', 'error');
        return false;
      }
    } catch (error) {
      console.error('Remove moderator error:', error);
      this.app.showToast('Failed to remove moderator', 'error');
      return false;
    }
  }

  async updateRoomSettings(roomId, settings) {
    if (!this.isRoomAdmin(roomId)) {
      this.app.showToast('Only admins can change settings', 'error');
      return false;
    }

    try {
      const response = await this.app.apiRequest(`/api/rooms/${roomId}/settings`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${this.app.token}` },
        body: JSON.stringify(settings)
      });

      if (response.success) {
        this.app.showToast('Room settings updated', 'success');
        // Update local room data
        const room = this.app.rooms.find(r => r.id === roomId);
        if (room) {
          Object.assign(room, settings);
          this.app.updateRoomsList();
          this.app.updateRoomHeader();
        }
        return true;
      } else {
        this.app.showToast(response.error || 'Failed to update settings', 'error');
        return false;
      }
    } catch (error) {
      console.error('Update room settings error:', error);
      this.app.showToast('Failed to update settings', 'error');
      return false;
    }
  }

  async deleteRoom(roomId) {
    if (!this.isRoomAdmin(roomId) && !this.isMaster()) {
      this.app.showToast('Permission denied', 'error');
      return false;
    }

    try {
      const response = await this.app.apiRequest(`/api/rooms/${roomId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${this.app.token}` }
      });

      if (response.success) {
        this.app.showToast('Channel deleted', 'success');
        this.app.rooms = this.app.rooms.filter(r => r.id !== roomId);
        this.app.updateRoomsList();
        if (this.app.currentRoom === roomId) {
          this.app.joinRoom('general');
        }
        return true;
      } else {
        this.app.showToast(response.error || 'Failed to delete channel', 'error');
        return false;
      }
    } catch (error) {
      console.error('Delete room error:', error);
      this.app.showToast('Failed to delete channel', 'error');
      return false;
    }
  }

  async clearRoomMessages(roomId) {
    if (!this.isRoomAdmin(roomId) && !this.isMaster()) {
      this.app.showToast('Permission denied', 'error');
      return false;
    }

    try {
      const response = await this.app.apiRequest(`/api/rooms/${roomId}/messages`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${this.app.token}` }
      });

      if (response.success) {
        this.app.showToast('All messages cleared', 'success');
        if (this.app.currentRoom === roomId) {
          this.app.chatElements.messages.innerHTML = '';
          this.app.messages.set(roomId, []);
          this.app.renderedMessageIds.clear();
        }
        return true;
      } else {
        this.app.showToast(response.error || 'Failed to clear messages', 'error');
        return false;
      }
    } catch (error) {
      console.error('Clear messages error:', error);
      this.app.showToast('Failed to clear messages', 'error');
      return false;
    }
  }

  async getRoomBannedUsers(roomId) {
    if (!this.isRoomModerator(roomId)) {
      return [];
    }

    try {
      const response = await this.app.apiRequest(`/api/rooms/${roomId}/banned`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.app.token}` }
      });

      return response.users || [];
    } catch (error) {
      console.error('Get room banned users error:', error);
      return [];
    }
  }

  async banUserFromRoom(userId, roomId, reason = '') {
    if (!this.isRoomModerator(roomId)) {
      this.app.showToast('Permission denied', 'error');
      return false;
    }

    try {
      const response = await this.app.apiRequest(`/api/rooms/${roomId}/ban`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.app.token}` },
        body: JSON.stringify({ userId, reason })
      });

      if (response.success) {
        this.app.showToast('User banned from channel', 'success');
        return true;
      } else {
        this.app.showToast(response.error || 'Failed to ban user', 'error');
        return false;
      }
    } catch (error) {
      console.error('Ban from room error:', error);
      this.app.showToast('Failed to ban user', 'error');
      return false;
    }
  }

  async unbanUserFromRoom(userId, roomId) {
    if (!this.isRoomModerator(roomId)) {
      this.app.showToast('Permission denied', 'error');
      return false;
    }

    try {
      const response = await this.app.apiRequest(`/api/rooms/${roomId}/unban`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.app.token}` },
        body: JSON.stringify({ userId })
      });

      if (response.success) {
        this.app.showToast('User unbanned from channel', 'success');
        return true;
      } else {
        this.app.showToast(response.error || 'Failed to unban user', 'error');
        return false;
      }
    } catch (error) {
      console.error('Unban from room error:', error);
      this.app.showToast('Failed to unban user', 'error');
      return false;
    }
  }
}
// ============================================
// MAIN CHAT APPLICATION
// ============================================
class ChatApp {
  // ============================================
  // CONSTRUCTOR & INITIALIZATION
  // ============================================
  constructor() {
    // Services
    this.pollingService = new PollingService(this);
    this.avatarService = new AvatarService();
    this.adminService = new AdminService(this);

    // WebSocket & Authentication
    this.ws = null;
    this.user = null;
    this.token = null;
    this.connectionId = null;
    
    // Reconnection
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = CONFIG.MAX_RECONNECT_ATTEMPTS;
    this.reconnectDelay = 2000;
    this.pingInterval = null;
    this.isConnecting = false;
    
    // Room & Messages
    this.currentRoom = 'general';
    this.rooms = [];
    this.messages = new Map();
    this.onlineUsers = new Map();
    this.renderedMessageIds = new Set();
    
    // Typing
    this.typingUsers = new Map();
    this.typingTimeout = null;
    this.isTyping = false;
    
    // UI State
    this.replyingTo = null;
    this.attachment = null;
    this.lastMessageDate = null;
    this.emojiCategories = this.initEmojiData();
    this.messageAlignment = localStorage.getItem('messageAlignment') || 'right';
    
    // Sidebar
    this.sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    this.sidebarOpen = false;
    
    // Direct Messages
    this.directMessages = new Map();
    this.currentDM = null;
    this.dmConversations = [];
    this.renderedDMIds = new Set();
    
    // Threads
    this.threads = new Map();
    this.currentThread = null;
    
    // Pinned Messages
    this.pinnedMessages = [];
    
    // Mentions
    this.mentionQuery = null;
    this.mentionIndex = 0;
    this.mentionUsers = [];
    
    // Context Menu
    this.contextMenuTarget = null;
    
    // Admin Panel
    this.adminPanelOpen = false;
    this.selectedUserForAdmin = null;
    
    // Settings
    this.settings = {
      soundEnabled: true,
      desktopNotifications: false,
      compactMode: false,
      showTimestamps: true,
      messageAlignment: 'right',
      enterToSend: true,
      showAvatars: true,
      animationsEnabled: true,
      fontSize: 'medium',
      language: 'en'
    };
    
    // Initialize
    this.init();
  }

  init() {
    console.log('🚀 Initializing ChatHub Enhanced...');
    this.cacheElements();
    this.attachEventListeners();
    this.initTheme();
    this.initEmojis();
    this.initSidebar();
    this.loadSettings();
    this.checkExistingSession();
    this.showOfflineQueueStatus();
    this.initKeyboardShortcuts();
    this.initAccessibility();
  }

  showOfflineQueueStatus() {
    const queuedCount = this.pollingService.getQueuedCount();
    if (queuedCount > 0) {
      this.showToast(`${queuedCount} message(s) waiting to be sent`, 'info');
    }
  }

  initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + K - Search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        this.sidebarElements.searchInput?.focus();
      }
      
      // Ctrl/Cmd + Shift + A - Admin Panel (for admins/masters)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        if (this.adminService.isMaster() || this.user?.role === CONFIG.USER_ROLES.ADMIN) {
          this.toggleAdminPanel();
        }
      }
      
      // Ctrl/Cmd + / - Show shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        this.showShortcutsModal();
      }

      // Escape - Close panels
      if (e.key === 'Escape') {
        this.closeAllPanels();
      }
    });
  }

  initAccessibility() {
    // Add ARIA labels
    document.querySelectorAll('button:not([aria-label])').forEach(btn => {
      const title = btn.getAttribute('title');
      if (title) btn.setAttribute('aria-label', title);
    });

    // Focus management
    this.setupFocusTrap();
  }

  setupFocusTrap() {
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          const focusable = modal.querySelectorAll('button, input, textarea, select, [tabindex]:not([tabindex="-1"])');
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      });
    });
  }

  // ============================================
  // ELEMENT CACHING
  // ============================================
  cacheElements() {
    // Screens
    this.screens = {
      loading: document.getElementById('loading-screen'),
      auth: document.getElementById('auth-screen'),
      chat: document.getElementById('chat-screen')
    };

    // Auth Elements
    this.authElements = {
      loginForm: document.getElementById('login-form'),
      registerForm: document.getElementById('register-form'),
      loginUsername: document.getElementById('login-username'),
      loginPassword: document.getElementById('login-password'),
      loginBtn: document.getElementById('login-btn'),
      loginError: document.getElementById('login-error'),
      registerUsername: document.getElementById('register-username'),
      registerEmail: document.getElementById('register-email'),
      registerDisplayName: document.getElementById('register-displayname'),
      registerPassword: document.getElementById('register-password'),
      registerConfirm: document.getElementById('register-confirm'),
      registerBtn: document.getElementById('register-btn'),
      registerError: document.getElementById('register-error'),
      showRegister: document.getElementById('show-register'),
      showLogin: document.getElementById('show-login'),
      rememberMe: document.getElementById('remember-me')
    };

    // Sidebar Elements
    this.sidebarElements = {
      sidebar: document.getElementById('sidebar'),
      overlay: document.getElementById('sidebar-overlay'),
      toggleBtn: document.getElementById('toggle-sidebar'),
      closeBtn: document.getElementById('close-sidebar-mobile'),
      mobileMenuBtn: document.getElementById('mobile-menu-btn'),
      searchInput: document.getElementById('search-input'),
      roomsList: document.getElementById('rooms-list'),
      usersList: document.getElementById('users-list'),
      dmList: document.getElementById('dm-list'),
      onlineCount: document.getElementById('online-count'),
      newDmBtn: document.getElementById('new-dm-btn'),
      createRoomBtn: document.getElementById('create-room-btn'),
      adminPanelBtn: document.getElementById('admin-panel-btn')
    };

    // User Profile Elements
    this.userProfileElements = {
      avatar: document.getElementById('user-avatar'),
      displayName: document.getElementById('user-displayname'),
      username: document.getElementById('user-username'),
      statusBtn: document.getElementById('status-btn'),
      statusDropdown: document.getElementById('status-dropdown'),
      settingsBtn: document.getElementById('settings-btn'),
      roleBadge: document.getElementById('user-role-badge')
    };

    // Chat Elements
    this.chatElements = {
      messagesContainer: document.getElementById('messages-container'),
      messages: document.getElementById('messages'),
      messageInput: document.getElementById('message-input'),
      sendBtn: document.getElementById('send-btn'),
      attachBtn: document.getElementById('attach-btn'),
      fileInput: document.getElementById('file-input'),
      emojiBtn: document.getElementById('emoji-btn'),
      emojiPicker: document.getElementById('emoji-picker'),
      emojiGrid: document.getElementById('emoji-grid'),
      emojiSearchInput: document.getElementById('emoji-search-input'),
      typingIndicator: document.getElementById('typing-indicator'),
      replyPreview: document.getElementById('reply-preview'),
      attachmentPreview: document.getElementById('attachment-preview'),
      cancelReply: document.getElementById('cancel-reply'),
      cancelAttachment: document.getElementById('cancel-attachment'),
      welcomeMessage: document.getElementById('welcome-message'),
      welcomeRoomName: document.getElementById('welcome-room-name')
    };

    // Chat Header Elements
    this.headerElements = {
      roomIcon: document.getElementById('current-room-icon'),
      roomName: document.getElementById('current-room-name'),
      roomDescription: document.getElementById('current-room-description'),
      pinBtn: document.getElementById('pin-btn'),
      membersBtn: document.getElementById('members-btn'),
      membersCount: document.getElementById('room-members-count'),
      themeToggle: document.getElementById('theme-toggle'),
      connectionStatus: document.getElementById('connection-status'),
      roomSettingsBtn: document.getElementById('room-settings-btn'),
      roomAdminBadge: document.getElementById('room-admin-badge')
    };

    // Mention Elements
    this.mentionElements = {
      dropdown: document.getElementById('mention-dropdown'),
      list: document.getElementById('mention-list')
    };

    // Thread Panel Elements
    this.threadElements = {
      panel: document.getElementById('thread-panel'),
      parent: document.getElementById('thread-parent'),
      replies: document.getElementById('thread-replies'),
      input: document.getElementById('thread-input'),
      sendBtn: document.getElementById('send-thread-reply'),
      closeBtn: document.getElementById('close-thread')
    };

    // Pinned Panel Elements
    this.pinnedElements = {
      panel: document.getElementById('pinned-panel'),
      list: document.getElementById('pinned-messages-list'),
      closeBtn: document.getElementById('close-pinned')
    };

    // DM Chat View Elements
    this.dmElements = {
      view: document.getElementById('dm-chat-view'),
      messagesContainer: document.getElementById('dm-messages-container'),
      messages: document.getElementById('dm-messages'),
      input: document.getElementById('dm-message-input'),
      sendBtn: document.getElementById('dm-send-btn'),
      backBtn: document.getElementById('back-to-rooms'),
      userAvatar: document.getElementById('dm-user-avatar'),
      userName: document.getElementById('dm-user-name'),
      userStatus: document.getElementById('dm-user-status'),
      userStatusText: document.getElementById('dm-user-status-text'),
      typingIndicator: document.getElementById('dm-typing-indicator'),
      attachBtn: document.getElementById('dm-attach-btn'),
      emojiBtn: document.getElementById('dm-emoji-btn')
    };

    // Admin Panel Elements
    this.adminElements = {
      panel: document.getElementById('admin-panel'),
      closeBtn: document.getElementById('close-admin-panel'),
      userList: document.getElementById('admin-user-list'),
      userSearch: document.getElementById('admin-user-search'),
      statsContainer: document.getElementById('admin-stats'),
      bannedUsersList: document.getElementById('banned-users-list'),
      announcementInput: document.getElementById('announcement-input'),
      sendAnnouncementBtn: document.getElementById('send-announcement-btn'),
      tabs: document.querySelectorAll('.admin-tab-btn'),
      tabContents: document.querySelectorAll('.admin-tab-content')
    };

    // Room Settings Elements
    this.roomSettingsElements = {
      modal: document.getElementById('room-settings-modal'),
      name: document.getElementById('room-settings-name'),
      description: document.getElementById('room-settings-description'),
      icon: document.getElementById('room-settings-icon'),
      slowMode: document.getElementById('room-slow-mode'),
      membersOnly: document.getElementById('room-members-only'),
      moderatorsList: document.getElementById('room-moderators-list'),
      bannedList: document.getElementById('room-banned-list'),
      saveBtn: document.getElementById('save-room-settings'),
      deleteBtn: document.getElementById('delete-room-btn'),
      clearMessagesBtn: document.getElementById('clear-room-messages-btn')
    };

    // User Management Modal Elements
    this.userManageElements = {
      modal: document.getElementById('user-manage-modal'),
      avatar: document.getElementById('manage-user-avatar'),
      name: document.getElementById('manage-user-name'),
      username: document.getElementById('manage-user-username'),
      role: document.getElementById('manage-user-role'),
      roleSelect: document.getElementById('manage-role-select'),
      banBtn: document.getElementById('manage-ban-btn'),
      kickBtn: document.getElementById('manage-kick-btn'),
      muteBtn: document.getElementById('manage-mute-btn'),
      deleteBtn: document.getElementById('manage-delete-btn'),
      messageBtn: document.getElementById('manage-message-btn'),
      banReason: document.getElementById('ban-reason-input'),
      banDuration: document.getElementById('ban-duration-select'),
      muteDuration: document.getElementById('mute-duration-select')
    };

    // Modal Elements
    this.modals = {
      settings: document.getElementById('settings-modal'),
      createRoom: document.getElementById('create-room-modal'),
      newDM: document.getElementById('new-dm-modal'),
      userProfile: document.getElementById('user-profile-modal'),
      image: document.getElementById('image-modal'),
      confirm: document.getElementById('confirm-modal'),
      roomSettings: document.getElementById('room-settings-modal'),
      userManage: document.getElementById('user-manage-modal'),
      shortcuts: document.getElementById('shortcuts-modal'),
      announcement: document.getElementById('announcement-modal')
    };

    // Settings Modal Elements
    this.settingsModalElements = {
      avatar: document.getElementById('settings-avatar'),
      avatarInput: document.getElementById('avatar-input'),
      avatarPreview: document.getElementById('avatar-preview'),
      avatarError: document.getElementById('avatar-error'),
      displayName: document.getElementById('settings-displayname'),
      bio: document.getElementById('settings-bio'),
      bioCharCount: document.getElementById('bio-char-count'),
      username: document.getElementById('settings-username'),
      email: document.getElementById('settings-email'),
      userId: document.getElementById('settings-userid'),
      themeSelect: document.getElementById('theme-select'),
      fontSizeSelect: document.getElementById('font-size-select'),
      compactModeToggle: document.getElementById('compact-mode-toggle'),
      timestampsToggle: document.getElementById('timestamps-toggle'),
      soundToggle: document.getElementById('sound-toggle'),
      desktopNotificationsToggle: document.getElementById('desktop-notifications-toggle'),
      previewToggle: document.getElementById('preview-toggle'),
      messageAlignmentSelect: document.getElementById('message-alignment-select'),
      enterToSendToggle: document.getElementById('enter-to-send-toggle'),
      showAvatarsToggle: document.getElementById('show-avatars-toggle'),
      animationsToggle: document.getElementById('animations-toggle'),
      saveBtn: document.getElementById('save-settings'),
      logoutBtn: document.getElementById('logout-btn')
    };

    // Create Room Modal Elements
    this.createRoomElements = {
      name: document.getElementById('new-room-name'),
      description: document.getElementById('new-room-description'),
      icon: document.getElementById('new-room-icon'),
      private: document.getElementById('new-room-private'),
      confirmBtn: document.getElementById('confirm-create-room')
    };

    // New DM Modal Elements
    this.newDMElements = {
      searchInput: document.getElementById('dm-search-input'),
      usersList: document.getElementById('dm-users-list'),
      recentList: document.getElementById('dm-recent-list')
    };

    // Confirm Modal Elements
    this.confirmModalElements = {
      title: document.getElementById('confirm-modal-title'),
      message: document.getElementById('confirm-modal-message'),
      confirmBtn: document.getElementById('confirm-modal-confirm'),
      cancelBtn: document.getElementById('confirm-modal-cancel')
    };

    // Context Menu
    this.contextMenu = document.getElementById('context-menu');

    // Toast Container
    this.toastContainer = document.getElementById('toast-container');

    // Audio Elements
    this.sounds = {
      notification: document.getElementById('notification-sound'),
      mention: document.getElementById('mention-sound'),
      sent: document.getElementById('sent-sound')
    };
  }

  // ============================================
  // EVENT LISTENERS
  // ============================================
  attachEventListeners() {
    // ===== AUTH EVENTS =====
    this.authElements.showRegister?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showAuthForm('register');
    });

    this.authElements.showLogin?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showAuthForm('login');
    });

    this.authElements.loginBtn?.addEventListener('click', () => this.handleLogin());
    this.authElements.loginPassword?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleLogin();
    });
    this.authElements.loginUsername?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.authElements.loginPassword?.focus();
    });

    this.authElements.registerBtn?.addEventListener('click', () => this.handleRegister());
    this.authElements.registerConfirm?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleRegister();
    });

    this.authElements.registerPassword?.addEventListener('input', (e) => {
      this.updatePasswordStrength(e.target.value);
    });

    // Password visibility toggles
    document.querySelectorAll('.toggle-password').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const input = e.target.closest('.password-input')?.querySelector('input');
        const icon = e.target.closest('.toggle-password')?.querySelector('i');
        if (input && icon) {
          if (input.type === 'password') {
            input.type = 'text';
            icon.classList.replace('fa-eye', 'fa-eye-slash');
          } else {
            input.type = 'password';
            icon.classList.replace('fa-eye-slash', 'fa-eye');
          }
        }
      });
    });

    // ===== SIDEBAR EVENTS =====
    this.sidebarElements.toggleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleSidebar();
    });

    this.sidebarElements.closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeMobileSidebar();
    });

    this.sidebarElements.mobileMenuBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openMobileSidebar();
    });

    this.sidebarElements.overlay?.addEventListener('click', () => {
      this.closeMobileSidebar();
    });

    this.sidebarElements.adminPanelBtn?.addEventListener('click', () => {
      this.toggleAdminPanel();
    });

    // ===== USER PROFILE EVENTS =====
    this.userProfileElements.statusBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.userProfileElements.statusDropdown?.classList.toggle('active');
    });

    document.querySelectorAll('#status-dropdown .dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const status = e.currentTarget.dataset.status;
        this.changeStatus(status);
        this.userProfileElements.statusDropdown?.classList.remove('active');
      });
    });

    this.userProfileElements.settingsBtn?.addEventListener('click', () => {
      this.openModal('settings');
    });

    // ===== SEARCH =====
    this.sidebarElements.searchInput?.addEventListener('input', this.debounce((e) => {
      this.searchMessages(e.target.value);
    }, 300));

    // ===== ROOM EVENTS =====
    this.sidebarElements.createRoomBtn?.addEventListener('click', () => {
      this.openModal('createRoom');
    });

    this.createRoomElements.confirmBtn?.addEventListener('click', () => {
      this.createRoom();
    });

    // Room settings button
    this.headerElements.roomSettingsBtn?.addEventListener('click', () => {
      if (this.adminService.isRoomAdmin(this.currentRoom) || this.adminService.isMaster()) {
        this.openRoomSettings();
      }
    });

    // Icon suggestions
    document.querySelectorAll('.icon-suggestion').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.dataset.emoji;
        if (this.createRoomElements.icon) {
          this.createRoomElements.icon.value = emoji;
        }
      });
    });

    // ===== DM EVENTS =====
    this.sidebarElements.newDmBtn?.addEventListener('click', () => {
      this.openNewDMModal();
    });

    this.dmElements.backBtn?.addEventListener('click', () => {
      this.closeDMChat();
    });

    this.dmElements.sendBtn?.addEventListener('click', () => {
      this.sendDMMessage();
    });

    this.dmElements.input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && this.settings.enterToSend) {
        e.preventDefault();
        this.sendDMMessage();
      }
    });

    this.dmElements.input?.addEventListener('input', (e) => {
      this.autoResizeTextarea(e.target);
    });

    this.newDMElements.searchInput?.addEventListener('input', (e) => {
      this.filterDMUsers(e.target.value);
    });

    // ===== MESSAGE INPUT EVENTS =====
    this.chatElements.sendBtn?.addEventListener('click', () => {
      this.sendMessage();
    });

    this.chatElements.messageInput?.addEventListener('keydown', (e) => {
      // Handle mention navigation
      if (this.mentionElements.dropdown?.classList.contains('active')) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.navigateMention(1);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.navigateMention(-1);
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          this.selectCurrentMention();
          return;
        }
        if (e.key === 'Escape') {
          this.hideMentionDropdown();
          return;
        }
      }

      // Send message on Enter (if enabled)
      if (e.key === 'Enter' && !e.shiftKey && this.settings.enterToSend) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    this.chatElements.messageInput?.addEventListener('input', (e) => {
      this.handleTyping();
      this.autoResizeTextarea(e.target);
      this.handleMentionInput(e);
    });

    // ===== ATTACHMENT EVENTS =====
    this.chatElements.attachBtn?.addEventListener('click', () => {
      this.chatElements.fileInput?.click();
    });

    this.chatElements.fileInput?.addEventListener('change', (e) => {
      this.handleFileSelect(e);
    });

    this.chatElements.cancelAttachment?.addEventListener('click', () => {
      this.clearAttachment();
    });

    // ===== AVATAR UPLOAD =====
    this.settingsModalElements.avatarInput?.addEventListener('change', (e) => {
      this.handleAvatarSelect(e);
    });

    // ===== REPLY EVENTS =====
    this.chatElements.cancelReply?.addEventListener('click', () => {
      this.clearReply();
    });

    // ===== EMOJI PICKER EVENTS =====
    this.chatElements.emojiBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.chatElements.emojiPicker?.classList.toggle('active');
    });

    this.chatElements.emojiPicker?.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    document.querySelectorAll('.emoji-categories button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.emoji-categories button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.loadEmojiCategory(btn.dataset.category);
      });
    });

    this.chatElements.emojiSearchInput?.addEventListener('input', (e) => {
      this.searchEmojis(e.target.value);
    });

    // ===== THEME TOGGLE =====
    this.headerElements.themeToggle?.addEventListener('click', () => {
      this.toggleTheme();
    });

    // ===== PIN BUTTON =====
    this.headerElements.pinBtn?.addEventListener('click', () => {
      this.togglePinnedPanel();
    });

    this.pinnedElements.closeBtn?.addEventListener('click', () => {
      this.closePinnedPanel();
    });

    // ===== THREAD EVENTS =====
    this.threadElements.closeBtn?.addEventListener('click', () => {
      this.closeThreadPanel();
    });

    this.threadElements.sendBtn?.addEventListener('click', () => {
      this.sendThreadReply();
    });

    this.threadElements.input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && this.settings.enterToSend) {
        e.preventDefault();
        this.sendThreadReply();
      }
    });

    // ===== ADMIN PANEL EVENTS =====
    this.adminElements.closeBtn?.addEventListener('click', () => {
      this.closeAdminPanel();
    });

    this.adminElements.userSearch?.addEventListener('input', this.debounce((e) => {
      this.searchUsersAdmin(e.target.value);
    }, 300));

    this.adminElements.sendAnnouncementBtn?.addEventListener('click', () => {
      this.sendAnnouncement();
    });

    this.adminElements.tabs?.forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchAdminTab(tab.dataset.tab);
      });
    });

    // ===== ROOM SETTINGS EVENTS =====
    this.roomSettingsElements.saveBtn?.addEventListener('click', () => {
      this.saveRoomSettings();
    });

    this.roomSettingsElements.deleteBtn?.addEventListener('click', () => {
      this.confirmDeleteRoom();
    });

    this.roomSettingsElements.clearMessagesBtn?.addEventListener('click', () => {
      this.confirmClearRoomMessages();
    });

    // ===== USER MANAGEMENT EVENTS =====
    this.userManageElements.banBtn?.addEventListener('click', () => {
      this.banSelectedUser();
    });

    this.userManageElements.kickBtn?.addEventListener('click', () => {
      this.kickSelectedUser();
    });

    this.userManageElements.muteBtn?.addEventListener('click', () => {
      this.muteSelectedUser();
    });

    this.userManageElements.deleteBtn?.addEventListener('click', () => {
      this.deleteSelectedUser();
    });

    this.userManageElements.roleSelect?.addEventListener('change', (e) => {
      this.changeSelectedUserRole(e.target.value);
    });

    // ===== SETTINGS MODAL EVENTS =====
    this.settingsModalElements.saveBtn?.addEventListener('click', () => {
      this.saveSettings();
    });

    this.settingsModalElements.logoutBtn?.addEventListener('click', () => {
      this.logout();
    });

    document.querySelector('.avatar-upload')?.addEventListener('click', () => {
      this.settingsModalElements.avatarInput?.click();
    });

    this.settingsModalElements.bio?.addEventListener('input', (e) => {
      const count = e.target.value.length;
      if (this.settingsModalElements.bioCharCount) {
        this.settingsModalElements.bioCharCount.textContent = count;
      }
    });

    this.settingsModalElements.messageAlignmentSelect?.addEventListener('change', (e) => {
      this.settings.messageAlignment = e.target.value;
      this.applyMessageAlignment();
    });

    // Settings tabs
    document.querySelectorAll('.settings-tabs .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchSettingsTab(btn.dataset.tab);
      });
    });

    // Copy user ID
    document.querySelector('.copy-btn')?.addEventListener('click', () => {
      const userId = this.settingsModalElements.userId?.value;
      if (userId) {
        navigator.clipboard.writeText(userId).then(() => {
          this.showToast('User ID copied!', 'success');
        });
      }
    });

    // ===== MODAL EVENTS =====
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        this.closeAllModals();
      });
    });

    document.querySelectorAll('.modal-cancel').forEach(btn => {
      btn.addEventListener('click', () => {
        this.closeAllModals();
      });
    });

    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closeAllModals();
        }
      });
    });

    // ===== USER PROFILE MODAL =====
    document.getElementById('send-dm-btn')?.addEventListener('click', () => {
      this.sendDMFromProfile();
    });

    document.getElementById('manage-user-btn')?.addEventListener('click', () => {
      this.openUserManagement();
    });

    // ===== CONTEXT MENU =====
    document.addEventListener('contextmenu', (e) => {
      const messageEl = e.target.closest('.message');
      if (messageEl && !messageEl.classList.contains('system-message')) {
        e.preventDefault();
        this.showContextMenu(e, messageEl);
      }
    });

    document.querySelectorAll('.context-menu-item').forEach(item => {
      item.addEventListener('click', () => {
        this.handleContextMenuAction(item.dataset.action);
      });
    });

    // ===== GLOBAL EVENTS =====
    document.addEventListener('click', (e) => {
      // Close dropdowns
      if (!e.target.closest('#status-dropdown') && !e.target.closest('#status-btn')) {
        this.userProfileElements.statusDropdown?.classList.remove('active');
      }

      if (!e.target.closest('.emoji-picker') && !e.target.closest('#emoji-btn')) {
        this.chatElements.emojiPicker?.classList.remove('active');
      }

      if (!e.target.closest('.mention-dropdown')) {
        this.hideMentionDropdown();
      }

      // Close context menu
      this.hideContextMenu();

      // Close mobile sidebar when clicking a room/user
      if (window.innerWidth <= 768 && this.sidebarOpen) {
        const clickedItem = e.target.closest('.room-item, .dm-item');
        if (clickedItem) {
          setTimeout(() => this.closeMobileSidebar(), 150);
        }
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAllModals();
        this.clearReply();
        this.chatElements.emojiPicker?.classList.remove('active');
        this.hideMentionDropdown();
        this.closeThreadPanel();
        this.closePinnedPanel();
        this.closeDMChat();
        this.hideContextMenu();
        this.closeAdminPanel();
      }
    });

    // Handle window resize
    window.addEventListener('resize', this.debounce(() => {
      this.handleResize();
    }, 100));

    // Handle visibility change (for reconnection)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.user) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          this.connectWebSocket();
        }
        this.pollingService.poll();
        this.pollingService.syncOfflineMessages();
      }
    });

    // Before unload
    window.addEventListener('beforeunload', () => {
      if (this.ws) {
        this.ws.close();
      }
      this.pollingService.stop();
    });

    // Online/Offline events
    window.addEventListener('online', () => {
      console.log('🌐 Browser is online');
      this.updateConnectionStatus('connecting');
      this.connectWebSocket();
    });

    window.addEventListener('offline', () => {
      console.log('📴 Browser is offline');
      this.updateConnectionStatus('offline');
      this.showToast('You are offline - messages will queue', 'warning');
    });

    // Drag and drop file upload
    this.chatElements.messagesContainer?.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.currentTarget.classList.add('drag-over');
    });

    this.chatElements.messagesContainer?.addEventListener('dragleave', (e) => {
      e.currentTarget.classList.remove('drag-over');
    });

    this.chatElements.messagesContainer?.addEventListener('drop', (e) => {
      e.preventDefault();
      e.currentTarget.classList.remove('drag-over');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.handleFileUpload(files[0]);
      }
    });
  }

  // ============================================
  // CONNECTION STATUS
  // ============================================
  updateConnectionStatus(status) {
    const indicator = this.headerElements.connectionStatus;
    if (!indicator) return;

    indicator.className = `connection-status ${status}`;
    
    const titles = {
      online: 'Connected (WebSocket)',
      polling: 'Connected (Polling)',
      connecting: 'Connecting...',
      offline: 'Offline (Messages will queue)'
    };
    
    indicator.title = titles[status] || 'Unknown';

    // Update body class for global styling
    document.body.classList.remove('status-online', 'status-polling', 'status-connecting', 'status-offline');
    document.body.classList.add(`status-${status}`);
  }

  // ============================================
  // AUTHENTICATION
  // ============================================
  async checkExistingSession() {
    const token = localStorage.getItem('chatToken') || sessionStorage.getItem('chatToken');

    if (!token) {
      this.showScreen('auth');
      return;
    }

    if (!navigator.onLine) {
      const cachedUser = localStorage.getItem('cachedUser');
      if (cachedUser) {
        try {
          this.user = JSON.parse(cachedUser);
          this.token = token;
          this.showScreen('chat');
          this.updateUI();
          this.updateConnectionStatus('offline');
          this.showToast('Offline mode - limited functionality', 'warning');
          return;
        } catch (e) {
          console.error('Failed to parse cached user:', e);
        }
      }
      this.showScreen('auth');
      this.showToast('Please connect to internet to login', 'error');
      return;
    }

    try {
      const response = await this.apiRequest('/api/auth/verify', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.success) {
        this.token = token;
        this.user = response.user;
        localStorage.setItem('cachedUser', JSON.stringify(response.user));
        this.connectWebSocket();
      } else {
        this.clearSession();
        this.showScreen('auth');
      }
    } catch (error) {
      console.error('Session verification failed:', error);
      const cachedUser = localStorage.getItem('cachedUser');
      if (cachedUser) {
        try {
          this.user = JSON.parse(cachedUser);
          this.token = token;
          this.showScreen('chat');
          this.updateUI();
          this.updateConnectionStatus('offline');
          this.showToast('Offline mode - limited functionality', 'warning');
          return;
        } catch (e) {
          console.error('Failed to parse cached user:', e);
        }
      }
      this.clearSession();
      this.showScreen('auth');
    }
  }

  async handleLogin() {
    const username = this.authElements.loginUsername?.value.trim();
    const password = this.authElements.loginPassword?.value;
    const remember = this.authElements.rememberMe?.checked;

    if (!username || !password) {
      this.showAuthError('login', 'Please fill in all fields');
      return;
    }

    if (!navigator.onLine) {
      this.showAuthError('login', 'You are offline. Please connect to internet to login.');
      return;
    }

    this.setButtonLoading(this.authElements.loginBtn, true, 'Signing in...');

    try {
      const response = await this.apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      if (response.success) {
        this.token = response.token;
        this.user = response.user;

        if (remember) {
          localStorage.setItem('chatToken', response.token);
        } else {
          sessionStorage.setItem('chatToken', response.token);
        }

        localStorage.setItem('cachedUser', JSON.stringify(response.user));
        this.connectWebSocket();

        // Show welcome message for admins/masters
        if (this.user.role === CONFIG.USER_ROLES.MASTER) {
          this.showToast('Welcome back, Master!', 'success');
        } else if (this.user.role === CONFIG.USER_ROLES.ADMIN) {
          this.showToast('Welcome back, Admin!', 'success');
        }
      } else {
        this.showAuthError('login', response.error || 'Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
      this.showAuthError('login', 'Connection failed. Please try again.');
    } finally {
      this.setButtonLoading(this.authElements.loginBtn, false, 'Sign In');
    }
  }

  async handleRegister() {
    const username = this.authElements.registerUsername?.value.trim();
    const email = this.authElements.registerEmail?.value.trim();
    const displayName = this.authElements.registerDisplayName?.value.trim();
    const password = this.authElements.registerPassword?.value;
    const confirm = this.authElements.registerConfirm?.value;

    // Validation
    if (!username || !email || !password) {
      this.showAuthError('register', 'Please fill in all required fields');
      return;
    }

    if (username.length < 3 || username.length > 20) {
      this.showAuthError('register', 'Username must be 3-20 characters');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      this.showAuthError('register', 'Username can only contain letters, numbers, and underscores');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.showAuthError('register', 'Please enter a valid email address');
      return;
    }

    if (password.length < 6) {
      this.showAuthError('register', 'Password must be at least 6 characters');
      return;
    }

    if (password !== confirm) {
      this.showAuthError('register', 'Passwords do not match');
      return;
    }

    if (!navigator.onLine) {
      this.showAuthError('register', 'You are offline. Please connect to internet to register.');
      return;
    }

    this.setButtonLoading(this.authElements.registerBtn, true, 'Creating account...');

    try {
      const response = await this.apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password, displayName })
      });

      if (response.success) {
        this.token = response.token;
        this.user = response.user;
        sessionStorage.setItem('chatToken', response.token);
        localStorage.setItem('cachedUser', JSON.stringify(response.user));
        this.connectWebSocket();
        this.showToast('Account created successfully!', 'success');
      } else {
        this.showAuthError('register', response.error || 'Registration failed');
      }
    } catch (error) {
      console.error('Registration error:', error);
      this.showAuthError('register', 'Connection failed. Please try again.');
    } finally {
      this.setButtonLoading(this.authElements.registerBtn, false, 'Create Account');
    }
  }

  showAuthForm(form) {
    if (form === 'register') {
      this.authElements.loginForm?.classList.remove('active');
      this.authElements.registerForm?.classList.add('active');
    } else {
      this.authElements.registerForm?.classList.remove('active');
      this.authElements.loginForm?.classList.add('active');
    }
    this.authElements.loginError?.classList.remove('show');
    this.authElements.registerError?.classList.remove('show');
  }

  showAuthError(form, message) {
    const errorEl = form === 'login' ? this.authElements.loginError : this.authElements.registerError;
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add('show');
      setTimeout(() => errorEl.classList.remove('show'), 5000);
    }
  }

  updatePasswordStrength(password) {
    const strengthBar = document.querySelector('.strength-bar');
    const strengthText = document.querySelector('.strength-text');
    if (!strengthBar) return;

    let strength = 0;
    let label = 'Weak';

    if (password.length >= 6) strength++;
    if (password.length >= 10) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    const percentage = (strength / 5) * 100;
    strengthBar.style.width = `${percentage}%`;

    strengthBar.className = 'strength-bar';
    if (strength <= 2) {
      strengthBar.classList.add('weak');
      label = 'Weak';
    } else if (strength <= 3) {
      strengthBar.classList.add('medium');
      label = 'Medium';
    } else {
      strengthBar.classList.add('strong');
      label = 'Strong';
    }

    if (strengthText) {
      strengthText.textContent = label;
    }
  }

  async logout() {
    try {
      if (navigator.onLine) {
        await this.apiRequest('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${this.token}` }
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    }

    this.pollingService.stop();
    this.pollingService.clearQueue();
    this.clearSession();
    this.closeAllModals();
    this.closeAdminPanel();
    this.showScreen('auth');
    this.showToast('Logged out successfully', 'info');
  }

  clearSession() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    localStorage.removeItem('chatToken');
    sessionStorage.removeItem('chatToken');
    localStorage.removeItem('cachedUser');
    this.user = null;
    this.token = null;
    this.messages.clear();
    this.onlineUsers.clear();
    this.renderedMessageIds.clear();
    this.renderedDMIds.clear();
  }

  // ============================================
  // WEBSOCKET CONNECTION
  // ============================================
  connectWebSocket() {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    if (!navigator.onLine) {
      console.log('📴 Offline - cannot connect WebSocket');
      this.updateConnectionStatus('offline');
      this.showScreen('chat');
      this.updateUI();
      return;
    }

    this.isConnecting = true;
    this.updateConnectionStatus('connecting');
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    console.log('🔌 Connecting to WebSocket...');

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (error) {
      console.error('WebSocket creation failed:', error);
      this.isConnecting = false;
      this.startPollingFallback();
      return;
    }

    this.ws.onopen = () => {
      console.log('✅ WebSocket connected');
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.updateConnectionStatus('online');
      this.authenticate();
      this.startPing();
      
      this.pollingService.stop();
      this.pollingService.syncOfflineMessages();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleWebSocketMessage(data);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    this.ws.onclose = (event) => {
      console.log('🔌 WebSocket disconnected', event.code);
      this.isConnecting = false;
      this.stopPing();

      if (this.user && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * this.reconnectAttempts;
        this.updateConnectionStatus('connecting');
        console.log(`Reconnecting in ${delay}ms... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        setTimeout(() => this.connectWebSocket(), delay);
      } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.startPollingFallback();
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.isConnecting = false;
    };
  }

  startPollingFallback() {
    console.log('📡 Starting polling fallback...');
    this.updateConnectionStatus('polling');
    this.showToast('Using polling mode for messages', 'info');
    this.pollingService.start();
    
    if (this.screens.chat?.classList.contains('active')) {
      this.pollingService.poll();
    }
  }

  authenticate() {
    this.wsSend({
      type: 'auth',
      token: this.token
    });
  }

  wsSend(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  startPing() {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      this.wsSend({ type: 'ping' });
    }, CONFIG.PING_INTERVAL);
  }

  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  handleWebSocketMessage(data) {
    switch (data.type) {
      case 'connected':
        this.connectionId = data.connectionId;
        console.log('Connection ID:', data.connectionId);
        break;

      case 'auth_success':
        this.user = data.user;
        this.rooms = data.rooms || [];
        this.onlineUsers = new Map((data.onlineUsers || []).map(u => [u.id, u]));
        localStorage.setItem('cachedUser', JSON.stringify(data.user));
        localStorage.setItem('cachedRooms', JSON.stringify(data.rooms));
        this.showScreen('chat');
        this.updateUI();
        this.joinRoom(this.currentRoom);
        this.loadDMConversations();
        break;

      case 'auth_error':
        this.showToast(data.message || 'Authentication failed', 'error');
        this.logout();
        break;

      case 'room_joined':
        this.handleRoomJoined(data);
        break;

      case 'new_message':
        this.handleNewMessage(data.message);
        break;

      case 'message_edited':
        this.handleMessageEdited(data);
        break;

      case 'message_deleted':
        this.handleMessageDeleted(data);
        break;

      case 'reaction_updated':
        this.handleReactionUpdated(data);
        break;

      case 'user_typing':
        this.handleUserTyping(data);
        break;

      case 'user_status_change':
        this.handleUserStatusChange(data);
        break;

      case 'user_joined_room':
        this.showSystemMessage(`${data.user.displayName || data.user.username} joined the room`);
        break;

      case 'user_left_room':
        this.showSystemMessage(`${data.user.displayName || data.user.username} left the room`);
        break;

      case 'room_created':
        this.handleRoomCreated(data.room);
        break;

      case 'room_deleted':
        this.handleRoomDeleted(data.roomId);
        break;

      case 'dm_received':
        this.handleDMReceived(data);
        break;

      case 'thread_reply':
        this.handleThreadReplyReceived(data);
        break;

      case 'message_pinned':
        this.handleMessagePinned(data);
        break;

      case 'message_unpinned':
        this.handleMessageUnpinned(data);
        break;

      case 'user_banned':
        this.handleUserBanned(data);
        break;

      case 'user_kicked':
        this.handleUserKicked(data);
        break;

      case 'user_muted':
        this.handleUserMuted(data);
        break;

      case 'announcement':
        this.handleAnnouncement(data);
        break;

      case 'role_changed':
        this.handleRoleChanged(data);
        break;

      case 'pong':
        break;

      case 'error':
        this.showToast(data.message || 'An error occurred', 'error');
        break;

      default:
        console.log('Unknown message type:', data.type);
    }
  }

  // Handle admin-related WebSocket messages
  handleUserBanned(data) {
    if (data.userId === this.user?.id) {
      this.showToast('You have been banned: ' + (data.reason || 'No reason provided'), 'error');
      this.logout();
    } else {
      this.onlineUsers.delete(data.userId);
      this.updateUsersList();
      if (this.adminService.isMaster() || this.user?.role === CONFIG.USER_ROLES.ADMIN) {
        this.showToast(`${data.username} has been banned`, 'info');
      }
    }
  }

  handleUserKicked(data) {
    if (data.userId === this.user?.id && data.roomId === this.currentRoom) {
      this.showToast('You have been kicked from this channel', 'warning');
      this.joinRoom('general');
    }
  }

  handleUserMuted(data) {
    if (data.userId === this.user?.id && data.roomId === this.currentRoom) {
      this.showToast(`You have been muted for ${data.duration} minutes`, 'warning');
    }
  }

  handleAnnouncement(data) {
    this.showAnnouncementNotification(data.message, data.from);
  }

  handleRoleChanged(data) {
    if (data.userId === this.user?.id) {
      this.user.role = data.role;
      localStorage.setItem('cachedUser', JSON.stringify(this.user));
      this.updateUI();
      this.showToast(`Your role has been changed to ${data.role}`, 'info');
    }
    
    const user = this.onlineUsers.get(data.userId);
    if (user) {
      user.role = data.role;
      this.updateUsersList();
    }
  }

  handleRoomDeleted(roomId) {
    this.rooms = this.rooms.filter(r => r.id !== roomId);
    this.updateRoomsList();
    
    if (this.currentRoom === roomId) {
      this.showToast('This channel has been deleted', 'warning');
      this.joinRoom('general');
    }
  }

  showAnnouncementNotification(message, from) {
    // Create special announcement toast
    const container = this.toastContainer;
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast announcement';
    toast.innerHTML = `
      <div class="announcement-header">
        <i class="fas fa-bullhorn"></i>
        <span>Announcement${from ? ` from ${this.escapeHtml(from)}` : ''}</span>
      </div>
      <div class="announcement-body">${this.escapeHtml(message)}</div>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    // Play announcement sound
    this.playSound('mention');

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 10000);
  }
  // ============================================
  // ROOM MANAGEMENT
  // ============================================
  joinRoom(roomId) {
    this.renderedMessageIds.clear();
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.wsSend({
        type: 'join_room',
        roomId
      });
    } else if (navigator.onLine) {
      this.joinRoomViaHTTP(roomId);
    } else {
      this.loadCachedRoomMessages(roomId);
    }
  }

  async joinRoomViaHTTP(roomId) {
    try {
      const response = await this.apiRequest(`/api/messages/${roomId}?limit=50`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      if (response.messages) {
        this.handleRoomJoined({
          roomId,
          messages: response.messages,
          lastMessageId: response.lastMessageId,
          pinnedMessages: [],
          roomInfo: response.roomInfo
        });
        localStorage.setItem(`cachedMessages_${roomId}`, JSON.stringify(response.messages));
      }
    } catch (error) {
      console.error('Join room via HTTP failed:', error);
      this.loadCachedRoomMessages(roomId);
    }
  }

  loadCachedRoomMessages(roomId) {
    const cached = localStorage.getItem(`cachedMessages_${roomId}`);
    if (cached) {
      try {
        const messages = JSON.parse(cached);
        this.handleRoomJoined({
          roomId,
          messages,
          lastMessageId: messages.length > 0 ? messages[messages.length - 1].id : null,
          pinnedMessages: []
        });
        this.showToast('Showing cached messages', 'info');
      } catch (e) {
        console.error('Failed to load cached messages:', e);
        this.showToast('No cached messages available', 'warning');
      }
    } else {
      this.currentRoom = roomId;
      this.updateRoomHeader();
      this.chatElements.welcomeMessage?.classList.remove('hidden');
    }
  }

  handleRoomJoined(data) {
    this.currentRoom = data.roomId;
    
    if (this.chatElements.messages) {
      this.chatElements.messages.innerHTML = '';
    }
    this.lastMessageDate = null;
    this.renderedMessageIds.clear();

    this.messages.set(this.currentRoom, data.messages || []);
    this.pollingService.setRoom(this.currentRoom, data.lastMessageId);

    if (data.messages && data.messages.length > 0) {
      this.chatElements.welcomeMessage?.classList.add('hidden');
      data.messages.forEach(msg => this.renderMessage(msg, false));
      localStorage.setItem(`cachedMessages_${this.currentRoom}`, JSON.stringify(data.messages));
    } else {
      this.chatElements.welcomeMessage?.classList.remove('hidden');
      if (this.chatElements.welcomeRoomName) {
        const room = this.rooms.find(r => r.id === this.currentRoom);
        this.chatElements.welcomeRoomName.textContent = room?.name || this.currentRoom;
      }
    }

    this.scrollToBottom();
    this.updateRoomsList();
    this.updateRoomHeader();
    this.updateRoomAdminUI();

    this.pinnedMessages = data.pinnedMessages || [];
  }

  updateRoomAdminUI() {
    const isAdmin = this.adminService.isRoomAdmin(this.currentRoom);
    const isMod = this.adminService.isRoomModerator(this.currentRoom);
    
    // Show/hide room settings button
    if (this.headerElements.roomSettingsBtn) {
      this.headerElements.roomSettingsBtn.style.display = isAdmin ? 'flex' : 'none';
    }
    
    // Show admin badge
    if (this.headerElements.roomAdminBadge) {
      if (isAdmin) {
        this.headerElements.roomAdminBadge.textContent = 'Admin';
        this.headerElements.roomAdminBadge.style.display = 'inline-block';
      } else if (isMod) {
        this.headerElements.roomAdminBadge.textContent = 'Mod';
        this.headerElements.roomAdminBadge.style.display = 'inline-block';
      } else {
        this.headerElements.roomAdminBadge.style.display = 'none';
      }
    }
  }

  updateRoomsList() {
    const container = this.sidebarElements.roomsList;
    if (!container) return;

    if (this.rooms.length === 0) {
      const cachedRooms = localStorage.getItem('cachedRooms');
      if (cachedRooms) {
        try {
          this.rooms = JSON.parse(cachedRooms);
        } catch (e) {
          console.error('Failed to load cached rooms:', e);
        }
      }
    }

    container.innerHTML = '';

    this.rooms.forEach(room => {
      const isAdmin = this.adminService.isRoomAdmin(room.id);
      const roomEl = document.createElement('div');
      roomEl.className = `room-item ${room.id === this.currentRoom ? 'active' : ''}`;
      roomEl.setAttribute('data-tooltip', room.name);
      roomEl.setAttribute('data-room-id', room.id);
      roomEl.innerHTML = `
        <span class="room-icon">${room.icon || '💬'}</span>
        <span class="room-name">${this.escapeHtml(room.name)}</span>
        ${isAdmin ? '<span class="room-admin-indicator"><i class="fas fa-crown"></i></span>' : ''}
        ${room.isPrivate ? '<span class="room-private-indicator"><i class="fas fa-lock"></i></span>' : ''}
      `;

      roomEl.addEventListener('click', () => {
        if (room.id !== this.currentRoom) {
          this.closeDMChat();
          this.joinRoom(room.id);
        }
      });

      // Right-click context menu for rooms
      roomEl.addEventListener('contextmenu', (e) => {
        if (isAdmin || this.adminService.isMaster()) {
          e.preventDefault();
          this.showRoomContextMenu(e, room);
        }
      });

      container.appendChild(roomEl);
    });
  }

  showRoomContextMenu(event, room) {
    // Create room context menu
    let menu = document.getElementById('room-context-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'room-context-menu';
      menu.className = 'context-menu';
      document.body.appendChild(menu);
    }

    menu.innerHTML = `
      <div class="context-menu-item" data-action="room-settings">
        <i class="fas fa-cog"></i> Settings
      </div>
      <div class="context-menu-item" data-action="room-clear">
        <i class="fas fa-broom"></i> Clear Messages
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item danger" data-action="room-delete">
        <i class="fas fa-trash"></i> Delete Channel
      </div>
    `;

    menu.style.left = `${event.pageX}px`;
    menu.style.top = `${event.pageY}px`;
    menu.classList.add('active');

    const handleAction = (e) => {
      const action = e.target.closest('.context-menu-item')?.dataset.action;
      if (!action) return;

      switch (action) {
        case 'room-settings':
          this.openRoomSettings(room.id);
          break;
        case 'room-clear':
          this.confirmClearRoomMessages(room.id);
          break;
        case 'room-delete':
          this.confirmDeleteRoom(room.id);
          break;
      }

      menu.classList.remove('active');
      menu.removeEventListener('click', handleAction);
    };

    menu.addEventListener('click', handleAction);

    // Close on outside click
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.classList.remove('active');
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  }

  updateRoomHeader() {
    const room = this.rooms.find(r => r.id === this.currentRoom);
    if (room) {
      if (this.headerElements.roomIcon) {
        this.headerElements.roomIcon.textContent = room.icon || '💬';
      }
      if (this.headerElements.roomName) {
        this.headerElements.roomName.textContent = room.name;
      }
      if (this.headerElements.roomDescription) {
        this.headerElements.roomDescription.textContent = room.description || '';
      }
    }
  }

  async createRoom() {
    const name = this.createRoomElements.name?.value.trim();
    const description = this.createRoomElements.description?.value.trim();
    const icon = this.createRoomElements.icon?.value.trim() || '💬';
    const isPrivate = this.createRoomElements.private?.checked || false;

    if (!name || name.length < 2) {
      this.showToast('Please enter a channel name (min 2 characters)', 'error');
      return;
    }

    if (!navigator.onLine) {
      this.showToast('Cannot create room while offline', 'error');
      return;
    }

    try {
      const response = await this.apiRequest('/api/rooms', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` },
        body: JSON.stringify({ name, description, icon, isPrivate })
      });

      if (response.success) {
        this.closeAllModals();
        this.clearCreateRoomForm();
        this.rooms.push(response.room);
        localStorage.setItem('cachedRooms', JSON.stringify(this.rooms));
        this.joinRoom(response.room.id);
        this.showToast('Channel created successfully!', 'success');
      } else {
        this.showToast(response.error || 'Failed to create channel', 'error');
      }
    } catch (error) {
      console.error('Create room error:', error);
      this.showToast('Failed to create channel', 'error');
    }
  }

  clearCreateRoomForm() {
    if (this.createRoomElements.name) this.createRoomElements.name.value = '';
    if (this.createRoomElements.description) this.createRoomElements.description.value = '';
    if (this.createRoomElements.icon) this.createRoomElements.icon.value = '';
    if (this.createRoomElements.private) this.createRoomElements.private.checked = false;
  }

  handleRoomCreated(room) {
    if (!this.rooms.find(r => r.id === room.id)) {
      this.rooms.push(room);
      localStorage.setItem('cachedRooms', JSON.stringify(this.rooms));
      this.updateRoomsList();
      this.showToast(`New channel: ${room.name}`, 'info');
    }
  }

  // Room Settings
  openRoomSettings(roomId = this.currentRoom) {
    const room = this.rooms.find(r => r.id === roomId);
    if (!room) return;

    if (this.roomSettingsElements.name) {
      this.roomSettingsElements.name.value = room.name;
    }
    if (this.roomSettingsElements.description) {
      this.roomSettingsElements.description.value = room.description || '';
    }
    if (this.roomSettingsElements.icon) {
      this.roomSettingsElements.icon.value = room.icon || '💬';
    }
    if (this.roomSettingsElements.slowMode) {
      this.roomSettingsElements.slowMode.value = room.slowMode || '0';
    }
    if (this.roomSettingsElements.membersOnly) {
      this.roomSettingsElements.membersOnly.checked = room.membersOnly || false;
    }

    // Load moderators list
    this.loadRoomModerators(roomId);
    
    // Load banned users
    this.loadRoomBannedUsers(roomId);

    this.openModal('roomSettings');
  }

  async loadRoomModerators(roomId) {
    const container = this.roomSettingsElements.moderatorsList;
    if (!container) return;

    const room = this.rooms.find(r => r.id === roomId);
    const moderatorIds = room?.moderatorIds || [];

    if (moderatorIds.length === 0) {
      container.innerHTML = '<p class="empty-text">No moderators</p>';
      return;
    }

    container.innerHTML = moderatorIds.map(id => {
      const user = this.onlineUsers.get(id);
      if (!user) return '';
      return `
        <div class="moderator-item" data-user-id="${id}">
          <img src="${user.avatar || this.avatarService.generateDefault(user.username)}" alt="">
          <span>${this.escapeHtml(user.displayName || user.username)}</span>
          <button class="btn-icon-tiny remove-mod-btn" title="Remove Moderator">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.remove-mod-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const userId = e.target.closest('.moderator-item').dataset.userId;
        this.adminService.removeRoomModerator(userId, roomId);
      });
    });
  }

  async loadRoomBannedUsers(roomId) {
    const container = this.roomSettingsElements.bannedList;
    if (!container) return;

    const bannedUsers = await this.adminService.getRoomBannedUsers(roomId);

    if (bannedUsers.length === 0) {
      container.innerHTML = '<p class="empty-text">No banned users</p>';
      return;
    }

    container.innerHTML = bannedUsers.map(user => `
      <div class="banned-item" data-user-id="${user.id}">
        <img src="${user.avatar || this.avatarService.generateDefault(user.username)}" alt="">
        <div class="banned-info">
          <span class="banned-name">${this.escapeHtml(user.displayName || user.username)}</span>
          <span class="banned-reason">${user.reason ? this.escapeHtml(user.reason) : 'No reason'}</span>
        </div>
        <button class="btn-icon-tiny unban-btn" title="Unban User">
          <i class="fas fa-user-check"></i>
        </button>
      </div>
    `).join('');

    container.querySelectorAll('.unban-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const userId = e.target.closest('.banned-item').dataset.userId;
        this.adminService.unbanUserFromRoom(userId, roomId);
      });
    });
  }

  async saveRoomSettings() {
    const roomId = this.currentRoom;
    const settings = {
      name: this.roomSettingsElements.name?.value.trim(),
      description: this.roomSettingsElements.description?.value.trim(),
      icon: this.roomSettingsElements.icon?.value.trim() || '💬',
      slowMode: parseInt(this.roomSettingsElements.slowMode?.value) || 0,
      membersOnly: this.roomSettingsElements.membersOnly?.checked || false
    };

    if (!settings.name || settings.name.length < 2) {
      this.showToast('Channel name must be at least 2 characters', 'error');
      return;
    }

    const success = await this.adminService.updateRoomSettings(roomId, settings);
    if (success) {
      this.closeAllModals();
    }
  }

  confirmDeleteRoom(roomId = this.currentRoom) {
    this.showConfirmModal(
      'Delete Channel',
      'Are you sure you want to delete this channel? This action cannot be undone.',
      async () => {
        await this.adminService.deleteRoom(roomId);
      },
      'Delete',
      'danger'
    );
  }

  confirmClearRoomMessages(roomId = this.currentRoom) {
    this.showConfirmModal(
      'Clear Messages',
      'Are you sure you want to delete all messages in this channel? This action cannot be undone.',
      async () => {
        await this.adminService.clearRoomMessages(roomId);
      },
      'Clear All',
      'warning'
    );
  }

  // ============================================
  // MESSAGING (WITH OFFLINE SUPPORT & RIGHT ALIGNMENT)
  // ============================================
  async sendMessage() {
    const text = this.chatElements.messageInput?.value.trim();

    if (!text && !this.attachment) return;

    if (this.chatElements.messageInput) {
      this.chatElements.messageInput.value = '';
      this.autoResizeTextarea(this.chatElements.messageInput);
    }

    const messageData = {
      text: text || '',
      attachment: this.attachment,
      replyTo: this.replyingTo
    };
    
    this.clearReply();
    this.clearAttachment();
    this.sendTypingStatus(false);

    if (!navigator.onLine) {
      const queued = this.pollingService.queueOfflineMessage({
        type: 'message',
        roomId: this.currentRoom,
        text: messageData.text,
        attachment: messageData.attachment,
        replyTo: messageData.replyTo,
        isDM: false
      });
      
      this.showPendingMessage(queued);
      this.showToast('Message queued - will send when online', 'info');
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.wsSend({
        type: 'message',
        roomId: this.currentRoom,
        text: messageData.text,
        attachment: messageData.attachment,
        replyTo: messageData.replyTo
      });
      this.playSound('sent');
    } else {
      await this.sendMessageViaHTTP(messageData);
    }
  }

  async sendMessageViaHTTP(messageData) {
    try {
      const response = await this.apiRequest(`/api/messages/${this.currentRoom}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` },
        body: JSON.stringify({
          text: messageData.text,
          attachment: messageData.attachment,
          replyTo: messageData.replyTo
        })
      });

      if (response.success) {
        this.handleNewMessage(response.message);
        this.pollingService.lastRoomMessageId = response.message.id;
        this.playSound('sent');
      } else {
        throw new Error(response.error || 'Failed to send');
      }
    } catch (error) {
      console.error('Send message error:', error);
      
      const queued = this.pollingService.queueOfflineMessage({
        type: 'message',
        roomId: this.currentRoom,
        text: messageData.text,
        attachment: messageData.attachment,
        replyTo: messageData.replyTo,
        isDM: false
      });
      
      this.showPendingMessage(queued);
      this.showToast('Message queued - will retry when connected', 'warning');
    }
  }

  async syncMessageToServer(message) {
    const response = await this.apiRequest(`/api/messages/${message.roomId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.token}` },
      body: JSON.stringify({
        text: message.text,
        attachment: message.attachment,
        replyTo: message.replyTo
      })
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to send message');
    }

    return response.message;
  }

  showPendingMessage(message) {
    const pendingMessage = {
      id: message.id,
      tempId: message.id,
      userId: this.user?.id,
      username: this.user?.username,
      displayName: this.user?.displayName,
      avatar: this.user?.avatar,
      text: message.text,
      attachment: message.attachment,
      replyTo: message.replyTo,
      roomId: message.roomId,
      createdAt: new Date(message.queuedAt).toISOString(),
      pending: true
    };
    
    this.handleNewMessage(pendingMessage);
  }

  markMessageAsSent(tempId) {
    const messageEl = document.querySelector(`[data-message-id="${tempId}"]`);
    if (messageEl) {
      messageEl.classList.remove('pending');
      const pendingIndicator = messageEl.querySelector('.pending-indicator');
      if (pendingIndicator) {
        pendingIndicator.innerHTML = '<i class="fas fa-check"></i> Sent';
        setTimeout(() => pendingIndicator.remove(), 2000);
      }
    }
  }

  handleNewMessage(message) {
    if (message.roomId !== this.currentRoom) return;

    if (this.renderedMessageIds.has(message.id)) {
      console.log('[Dedup] Message already rendered:', message.id);
      return;
    }

    const roomMessages = this.messages.get(this.currentRoom) || [];
    if (!roomMessages.find(m => m.id === message.id)) {
      roomMessages.push(message);
      this.messages.set(this.currentRoom, roomMessages);
      localStorage.setItem(`cachedMessages_${this.currentRoom}`, JSON.stringify(roomMessages.slice(-CONFIG.MESSAGE_CACHE_LIMIT)));
    }

    if (!message.pending) {
      this.pollingService.lastRoomMessageId = message.id;
    }

    this.chatElements.welcomeMessage?.classList.add('hidden');
    this.renderMessage(message, true);

    if (message.userId !== this.user?.id && !message.pending) {
      this.playSound('notification');
      this.showDesktopNotification(message);
    }
  }

  renderMessage(message, scroll = true) {
    const container = this.chatElements.messages;
    if (!container) return;

    if (this.renderedMessageIds.has(message.id)) {
      return;
    }
    this.renderedMessageIds.add(message.id);

    // Add date separator if needed
    const messageDate = new Date(message.createdAt).toDateString();
    if (messageDate !== this.lastMessageDate) {
      this.addDateSeparator(message.createdAt);
      this.lastMessageDate = messageDate;
    }

    const isOwn = message.userId === this.user?.id;
    const messageEl = document.createElement('div');
    
    // Apply alignment class based on settings
    const alignmentClass = this.settings.messageAlignment === 'right' && isOwn ? 'aligned-right' : '';
    
    messageEl.className = `message ${message.pending ? 'pending' : ''} ${isOwn ? 'own' : ''} ${alignmentClass}`;
    messageEl.dataset.messageId = message.id;
    messageEl.dataset.userId = message.userId;

    const avatar = message.avatar || this.avatarService.generateDefault(message.username);
    const time = this.formatTime(message.createdAt);
    const displayName = message.displayName || message.username;

    // User role badge
    const userRole = this.getUserRole(message.userId);
    const roleBadgeHtml = this.getRoleBadgeHtml(userRole);

    // Reply HTML
    let replyHtml = '';
    if (message.replyTo) {
      const replyMsg = this.findMessage(message.replyTo);
      if (replyMsg) {
        replyHtml = `
          <div class="message-reply" onclick="app.scrollToMessage('${message.replyTo}')">
            <i class="fas fa-reply"></i>
            <span class="reply-author">${this.escapeHtml(replyMsg.displayName || replyMsg.username)}</span>
            <span class="reply-text">${this.escapeHtml(this.truncateText(replyMsg.text, 50))}</span>
          </div>
        `;
      }
    }

    // Attachment HTML
    let attachmentHtml = '';
    if (message.attachment) {
      if (message.attachment.type?.startsWith('image/')) {
        attachmentHtml = `
          <div class="message-attachment image">
            <img src="${message.attachment.url}" alt="${this.escapeHtml(message.attachment.name)}" 
                 onclick="app.openImageModal('${message.attachment.url}')" loading="lazy">
          </div>
        `;
      } else if (message.attachment.type?.startsWith('video/')) {
        attachmentHtml = `
          <div class="message-attachment video">
            <video controls preload="metadata">
              <source src="${message.attachment.url}" type="${message.attachment.type}">
            </video>
          </div>
        `;
      } else if (message.attachment.type?.startsWith('audio/')) {
        attachmentHtml = `
          <div class="message-attachment audio">
            <audio controls preload="metadata">
              <source src="${message.attachment.url}" type="${message.attachment.type}">
            </audio>
          </div>
        `;
      } else {
        const fileIcon = this.getFileIcon(message.attachment.type);
        attachmentHtml = `
          <div class="message-attachment file">
            <i class="fas ${fileIcon}"></i>
            <div class="file-info">
              <a href="${message.attachment.url}" target="_blank" rel="noopener">${this.escapeHtml(message.attachment.name)}</a>
              <span class="file-size">${this.formatFileSize(message.attachment.size)}</span>
            </div>
            <a href="${message.attachment.url}" download class="download-btn" title="Download">
              <i class="fas fa-download"></i>
            </a>
          </div>
        `;
      }
    }

    // Reactions HTML
    const reactionsHtml = this.renderReactions(message.reactions || {}, message.id);

    // Thread indicator
    const threadCount = message.threadCount || 0;
    const threadHtml = threadCount > 0 ? `
      <div class="message-thread-indicator" onclick="app.openThread('${message.id}')">
        <i class="fas fa-comments"></i>
        <span>${threadCount} ${threadCount === 1 ? 'reply' : 'replies'}</span>
      </div>
    ` : '';

    // Pending indicator
    const pendingHtml = message.pending ? `
      <div class="pending-indicator">
        <i class="fas fa-clock"></i> Sending...
      </div>
    ` : '';

    // Admin actions (for moderators/admins viewing other users' messages)
    const canModerate = this.adminService.isRoomModerator(this.currentRoom) && !isOwn;
    const adminActionsHtml = canModerate ? `
      <button class="btn-icon-tiny admin-action" onclick="app.openUserManagement('${message.userId}')" title="Manage User">
        <i class="fas fa-user-shield"></i>
      </button>
      <button class="btn-icon-tiny admin-action" onclick="app.adminDeleteMessage('${message.id}')" title="Delete (Mod)">
        <i class="fas fa-trash-alt"></i>
      </button>
    ` : '';

    // Show avatars based on settings
    const avatarHtml = this.settings.showAvatars ? `
      <img class="message-avatar" src="${avatar}" alt="" 
           onclick="app.openUserProfile('${message.userId}')" loading="lazy">
    ` : '';

    messageEl.innerHTML = `
      ${avatarHtml}
      <div class="message-content">
        <div class="message-header">
          <span class="message-author" onclick="app.openUserProfile('${message.userId}')">
            ${this.escapeHtml(displayName)}
            ${roleBadgeHtml}
          </span>
          ${this.settings.showTimestamps ? `<span class="message-time" title="${new Date(message.createdAt).toLocaleString()}">${time}</span>` : ''}
          ${message.edited ? '<span class="message-edited">(edited)</span>' : ''}
        </div>
        ${replyHtml}
        <div class="message-text">${this.formatMessageText(message.text)}</div>
        ${attachmentHtml}
        ${pendingHtml}
        ${threadHtml}
        <div class="message-reactions">${reactionsHtml}</div>
      </div>
      ${!message.pending ? `
        <div class="message-actions">
          <button class="btn-icon-tiny" onclick="app.addReaction('${message.id}')" title="Add Reaction">
            <i class="fas fa-smile"></i>
          </button>
          <button class="btn-icon-tiny" onclick="app.replyToMessage('${message.id}')" title="Reply">
            <i class="fas fa-reply"></i>
          </button>
          <button class="btn-icon-tiny" onclick="app.openThread('${message.id}')" title="Start Thread">
            <i class="fas fa-comments"></i>
          </button>
          ${isOwn ? `
            <button class="btn-icon-tiny" onclick="app.editMessage('${message.id}')" title="Edit">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn-icon-tiny" onclick="app.deleteMessage('${message.id}')" title="Delete">
              <i class="fas fa-trash"></i>
            </button>
          ` : ''}
          <button class="btn-icon-tiny" onclick="app.pinMessage('${message.id}')" title="Pin">
            <i class="fas fa-thumbtack"></i>
          </button>
          ${adminActionsHtml}
        </div>
      ` : ''}
    `;

    container.appendChild(messageEl);

    if (scroll) {
      this.scrollToBottom();
    }
  }

  getUserRole(userId) {
    if (userId === this.user?.id) {
      return this.user.role;
    }
    const user = this.onlineUsers.get(userId);
    return user?.role || CONFIG.USER_ROLES.MEMBER;
  }

  getRoleBadgeHtml(role) {
    const badges = {
      [CONFIG.USER_ROLES.MASTER]: '<span class="role-badge master" title="Master"><i class="fas fa-crown"></i></span>',
      [CONFIG.USER_ROLES.ADMIN]: '<span class="role-badge admin" title="Admin"><i class="fas fa-shield-alt"></i></span>',
      [CONFIG.USER_ROLES.MODERATOR]: '<span class="role-badge moderator" title="Moderator"><i class="fas fa-gavel"></i></span>'
    };
    return badges[role] || '';
  }

  applyMessageAlignment() {
    const messages = document.querySelectorAll('.message.own');
    messages.forEach(msg => {
      if (this.settings.messageAlignment === 'right') {
        msg.classList.add('aligned-right');
      } else {
        msg.classList.remove('aligned-right');
      }
    });
    localStorage.setItem('messageAlignment', this.settings.messageAlignment);
  }

  adminDeleteMessage(messageId) {
    this.showConfirmModal(
      'Delete Message',
      'Are you sure you want to delete this message? This action will be logged.',
      async () => {
        await this.adminService.deleteAnyMessage(messageId, this.currentRoom);
        this.handleMessageDeleted({ messageId });
      },
      'Delete',
      'danger'
    );
  }

  addDateSeparator(date) {
    const container = this.chatElements.messages;
    if (!container) return;

    const separator = document.createElement('div');
    separator.className = 'date-separator';
    separator.innerHTML = `<span>${this.formatDateFull(date)}</span>`;
    container.appendChild(separator);
  }

  formatMessageText(text) {
    if (!text) return '';

    let formatted = this.escapeHtml(text);

    // URLs with preview
    formatted = formatted.replace(
      /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer" class="message-link">$1</a>'
    );

    // Mentions (@username)
    formatted = formatted.replace(
      /@(\w+)/g,
      '<span class="mention" onclick="app.handleMentionClick(\'$1\')">@$1</span>'
    );

    // Channel mentions (#channel)
    formatted = formatted.replace(
      /#(\w+)/g,
      '<span class="channel-mention" onclick="app.handleChannelClick(\'$1\')">#$1</span>'
    );

    // Bold (**text**)
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic (*text* or _text_)
    formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/_([^_]+)_/g, '<em>$1</em>');

    // Code blocks (```code```)
    formatted = formatted.replace(/```([\s\S]+?)```/g, '<pre class="code-block">$1</pre>');

    // Inline code (`code`)
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Strikethrough (~~text~~)
    formatted = formatted.replace(/~~(.+?)~~/g, '<del>$1</del>');

    // Spoilers (||text||)
    formatted = formatted.replace(/\|\|(.+?)\|\|/g, '<span class="spoiler" onclick="this.classList.toggle(\'revealed\')">$1</span>');

    // Blockquote (> text)
    formatted = formatted.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // Newlines
    formatted = formatted.replace(/\n/g, '<br>');

    return formatted;
  }

  handleChannelClick(channelName) {
    const room = this.rooms.find(r => r.name.toLowerCase() === channelName.toLowerCase());
    if (room) {
      this.joinRoom(room.id);
    } else {
      this.showToast('Channel not found', 'warning');
    }
  }

  renderReactions(reactions, messageId) {
    if (!reactions || Object.keys(reactions).length === 0) return '';

    return Object.entries(reactions).map(([emoji, userIds]) => {
      const isOwn = userIds.includes(this.user?.id);
      const count = userIds.length;
      return `
        <button class="reaction ${isOwn ? 'own' : ''}" 
                onclick="app.toggleReaction('${messageId}', '${emoji}')"
                title="${count} ${count === 1 ? 'person' : 'people'} reacted">
          <span class="reaction-emoji">${emoji}</span>
          <span class="reaction-count">${count}</span>
        </button>
      `;
    }).join('');
  }

  // Message Actions
  replyToMessage(messageId) {
    const message = this.findMessage(messageId);
    if (!message) return;

    this.replyingTo = messageId;

    const preview = this.chatElements.replyPreview;
    if (preview) {
      preview.classList.add('active');
      const userEl = preview.querySelector('.reply-to-user');
      const textEl = preview.querySelector('.reply-to-text');
      if (userEl) userEl.textContent = message.displayName || message.username;
      if (textEl) textEl.textContent = this.truncateText(message.text, 100);
    }

    this.chatElements.messageInput?.focus();
  }

  clearReply() {
    this.replyingTo = null;
    this.chatElements.replyPreview?.classList.remove('active');
  }

  editMessage(messageId) {
    const message = this.findMessage(messageId);
    if (!message || message.userId !== this.user?.id) return;

    if (!navigator.onLine) {
      this.showToast('Cannot edit message while offline', 'error');
      return;
    }

    // Create inline edit
    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
    const textEl = messageEl?.querySelector('.message-text');
    if (!textEl) return;

    const originalText = message.text;
    const editContainer = document.createElement('div');
    editContainer.className = 'inline-edit-container';
    editContainer.innerHTML = `
      <textarea class="inline-edit-input">${this.escapeHtml(originalText)}</textarea>
      <div class="inline-edit-actions">
        <button class="btn-small btn-primary save-edit-btn">Save</button>
        <button class="btn-small btn-secondary cancel-edit-btn">Cancel</button>
      </div>
    `;

    textEl.replaceWith(editContainer);

    const textarea = editContainer.querySelector('.inline-edit-input');
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    const saveEdit = () => {
      const newText = textarea.value.trim();
      if (newText && newText !== originalText) {
        this.wsSend({
          type: 'edit_message',
          messageId,
          text: newText
        });
      }
      restoreOriginal();
    };

    const restoreOriginal = () => {
      const newTextEl = document.createElement('div');
      newTextEl.className = 'message-text';
      newTextEl.innerHTML = this.formatMessageText(message.text);
      editContainer.replaceWith(newTextEl);
    };

    editContainer.querySelector('.save-edit-btn').addEventListener('click', saveEdit);
    editContainer.querySelector('.cancel-edit-btn').addEventListener('click', restoreOriginal);

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        saveEdit();
      }
      if (e.key === 'Escape') {
        restoreOriginal();
      }
    });
  }

  deleteMessage(messageId) {
    const message = this.findMessage(messageId);
    if (!message || message.userId !== this.user?.id) return;

    if (!navigator.onLine) {
      this.showToast('Cannot delete message while offline', 'error');
      return;
    }

    this.showConfirmModal(
      'Delete Message',
      'Are you sure you want to delete this message?',
      () => {
        this.wsSend({
          type: 'delete_message',
          messageId
        });
      },
      'Delete',
      'danger'
    );
  }

  handleMessageEdited(data) {
    const messageEl = document.querySelector(`[data-message-id="${data.messageId}"]`);
    if (messageEl) {
      const textEl = messageEl.querySelector('.message-text');
      if (textEl) {
        textEl.innerHTML = this.formatMessageText(data.text);
      }
      if (!messageEl.querySelector('.message-edited')) {
        const timeEl = messageEl.querySelector('.message-time');
        timeEl?.insertAdjacentHTML('afterend', '<span class="message-edited">(edited)</span>');
      }
    }

    const roomMessages = this.messages.get(this.currentRoom) || [];
    const msg = roomMessages.find(m => m.id === data.messageId);
    if (msg) {
      msg.text = data.text;
      msg.edited = true;
      localStorage.setItem(`cachedMessages_${this.currentRoom}`, JSON.stringify(roomMessages.slice(-CONFIG.MESSAGE_CACHE_LIMIT)));
    }
  }

  handleMessageDeleted(data) {
    const messageEl = document.querySelector(`[data-message-id="${data.messageId}"]`);
    if (messageEl) {
      messageEl.classList.add('deleted');
      if (this.settings.animationsEnabled) {
        messageEl.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => messageEl.remove(), 300);
      } else {
        messageEl.remove();
      }
    }

    this.renderedMessageIds.delete(data.messageId);

    const roomMessages = this.messages.get(this.currentRoom) || [];
    const index = roomMessages.findIndex(m => m.id === data.messageId);
    if (index > -1) {
      roomMessages.splice(index, 1);
      localStorage.setItem(`cachedMessages_${this.currentRoom}`, JSON.stringify(roomMessages.slice(-CONFIG.MESSAGE_CACHE_LIMIT)));
    }
  }

  // Reactions
  addReaction(messageId) {
    if (!navigator.onLine) {
      this.showToast('Cannot add reaction while offline', 'warning');
      return;
    }

    const quickReactions = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👀', '💯', '🙏'];

    document.querySelectorAll('.quick-reactions').forEach(el => el.remove());

    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageEl) return;

    const picker = document.createElement('div');
    picker.className = 'quick-reactions';
    picker.innerHTML = quickReactions.map(emoji =>
      `<button onclick="app.toggleReaction('${messageId}', '${emoji}'); this.parentElement.remove();">${emoji}</button>`
    ).join('') + `<button class="more-emoji-btn" onclick="app.openEmojiPickerForMessage('${messageId}')"><i class="fas fa-plus"></i></button>`;

    messageEl.appendChild(picker);
    setTimeout(() => picker.remove(), 5000);
  }

  openEmojiPickerForMessage(messageId) {
    // Store message ID for emoji picker
    this.emojiPickerTargetMessage = messageId;
    this.chatElements.emojiPicker?.classList.add('active');
  }

  toggleReaction(messageId, emoji) {
    if (!navigator.onLine) {
      this.showToast('Cannot react while offline', 'warning');
      return;
    }

    this.wsSend({
      type: 'reaction',
      messageId,
      emoji
    });
  }

  handleReactionUpdated(data) {
    const messageEl = document.querySelector(`[data-message-id="${data.messageId}"]`);
    if (messageEl) {
      const reactionsEl = messageEl.querySelector('.message-reactions');
      if (reactionsEl) {
        reactionsEl.innerHTML = this.renderReactions(data.reactions, data.messageId);
      }
    }

    const roomMessages = this.messages.get(this.currentRoom) || [];
    const msg = roomMessages.find(m => m.id === data.messageId);
    if (msg) {
      msg.reactions = data.reactions;
    }
  }

  findMessage(messageId) {
    for (const [, messages] of this.messages) {
      const msg = messages.find(m => m.id === messageId);
      if (msg) return msg;
    }
    return null;
  }

  scrollToMessage(messageId) {
    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageEl) {
      messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      messageEl.classList.add('highlight');
      setTimeout(() => messageEl.classList.remove('highlight'), 2000);
    }
  }

  showSystemMessage(text, type = 'info') {
    const container = this.chatElements.messages;
    if (!container) return;

    const icons = {
      info: 'fa-info-circle',
      warning: 'fa-exclamation-triangle',
      error: 'fa-exclamation-circle',
      success: 'fa-check-circle',
      join: 'fa-user-plus',
      leave: 'fa-user-minus'
    };

    const messageEl = document.createElement('div');
    messageEl.className = `system-message ${type}`;
    messageEl.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${this.escapeHtml(text)}`;
    container.appendChild(messageEl);
    this.scrollToBottom();
  }

  // ============================================
  // TYPING INDICATOR
  // ============================================
  handleTyping() {
    if (!this.isTyping) {
      this.isTyping = true;
      this.sendTypingStatus(true);
    }

    clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => {
      this.isTyping = false;
      this.sendTypingStatus(false);
    }, 1500);
  }

  sendTypingStatus(isTyping) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.wsSend({
        type: 'typing',
        isTyping
      });
    }
  }

  handleUserTyping(data) {
    if (data.roomId !== this.currentRoom) return;
    if (data.userId === this.user?.id) return;

    if (data.isTyping) {
      this.typingUsers.set(data.userId, {
        username: data.username,
        displayName: data.displayName
      });
    } else {
      this.typingUsers.delete(data.userId);
    }

    this.updateTypingIndicator();
  }

  updateTypingIndicator() {
    const indicator = this.chatElements.typingIndicator;
    if (!indicator) return;

    const users = Array.from(this.typingUsers.values());

    if (users.length === 0) {
      indicator.classList.remove('active');
      return;
    }

    let text = '';
    if (users.length === 1) {
      text = `${users[0].displayName || users[0].username} is typing`;
    } else if (users.length === 2) {
      text = `${users[0].displayName || users[0].username} and ${users[1].displayName || users[1].username} are typing`;
    } else {
      text = `${users[0].displayName || users[0].username} and ${users.length - 1} others are typing`;
    }

    const textEl = indicator.querySelector('.typing-text');
    if (textEl) textEl.textContent = text;
    indicator.classList.add('active');
  }

  // ============================================
  // FILE ATTACHMENTS
  // ============================================
  handleFileSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    this.handleFileUpload(file);
    event.target.value = '';
  }

  async handleFileUpload(file) {
    if (file.size > CONFIG.MAX_FILE_SIZE) {
      this.showToast(`File size must be less than ${this.formatFileSize(CONFIG.MAX_FILE_SIZE)}`, 'error');
      return;
    }

    if (!navigator.onLine) {
      this.showToast('Cannot upload files while offline', 'error');
      return;
    }

    this.uploadFile(file);
  }

  async uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    // Show upload progress
    this.showUploadProgress(file.name);

    try {
      const response = await fetch('/api/upload/attachment', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` },
        body: formData
      });

      const data = await response.json();

      if (response.ok && data.success) {
        this.attachment = data.file;
        this.showAttachmentPreview(data.file);
        this.hideUploadProgress();
        this.showToast('File uploaded', 'success');
      } else {
        this.hideUploadProgress();
        this.showToast(data.error || 'Upload failed', 'error');
      }
    } catch (error) {
      console.error('Upload error:', error);
      this.hideUploadProgress();
      this.showToast('Failed to upload file', 'error');
    }
  }

  showUploadProgress(fileName) {
    const preview = this.chatElements.attachmentPreview;
    if (!preview) return;

    preview.classList.add('active', 'uploading');
    const nameEl = preview.querySelector('.attachment-name');
    const sizeEl = preview.querySelector('.attachment-size');
    if (nameEl) nameEl.textContent = fileName;
    if (sizeEl) sizeEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
  }

  hideUploadProgress() {
    const preview = this.chatElements.attachmentPreview;
    if (preview) {
      preview.classList.remove('uploading');
    }
  }

  showAttachmentPreview(file) {
    const preview = this.chatElements.attachmentPreview;
    if (!preview) return;

    preview.classList.add('active');
    preview.classList.remove('uploading');
    
    const nameEl = preview.querySelector('.attachment-name');
    const sizeEl = preview.querySelector('.attachment-size');
    const thumbEl = preview.querySelector('.attachment-thumbnail');
    
    if (nameEl) nameEl.textContent = file.name;
    if (sizeEl) sizeEl.textContent = this.formatFileSize(file.size);
    
    // Show thumbnail for images
    if (thumbEl && file.type?.startsWith('image/')) {
      thumbEl.innerHTML = `<img src="${file.url}" alt="">`;
      thumbEl.style.display = 'block';
    } else if (thumbEl) {
      thumbEl.style.display = 'none';
    }
  }

  clearAttachment() {
    this.attachment = null;
    const preview = this.chatElements.attachmentPreview;
    if (preview) {
      preview.classList.remove('active', 'uploading');
      const thumbEl = preview.querySelector('.attachment-thumbnail');
      if (thumbEl) {
        thumbEl.innerHTML = '';
        thumbEl.style.display = 'none';
      }
    }
  }

  getFileIcon(mimeType) {
    if (!mimeType) return 'fa-file';
    if (mimeType.startsWith('image/')) return 'fa-file-image';
    if (mimeType.startsWith('video/')) return 'fa-file-video';
    if (mimeType.startsWith('audio/')) return 'fa-file-audio';
    if (mimeType.includes('pdf')) return 'fa-file-pdf';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'fa-file-word';
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'fa-file-excel';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'fa-file-powerpoint';
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('archive') || mimeType.includes('compressed')) return 'fa-file-archive';
    if (mimeType.includes('text') || mimeType.includes('plain')) return 'fa-file-alt';
    if (mimeType.includes('code') || mimeType.includes('javascript') || mimeType.includes('json') || mimeType.includes('html') || mimeType.includes('css')) return 'fa-file-code';
    return 'fa-file';
  }

  // ============================================
  // AVATAR HANDLING
  // ============================================
  async handleAvatarSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file
    const validation = this.avatarService.validateFile(file);
    if (!validation.valid) {
      this.showToast(validation.errors.join('. '), 'error');
      if (this.settingsModalElements.avatarError) {
        this.settingsModalElements.avatarError.textContent = validation.errors.join('. ');
        this.settingsModalElements.avatarError.style.display = 'block';
      }
      return;
    }

    // Hide error
    if (this.settingsModalElements.avatarError) {
      this.settingsModalElements.avatarError.style.display = 'none';
    }

    // Show preview immediately
    try {
      const preview = await this.avatarService.createPreview(file);
      if (this.settingsModalElements.avatarPreview) {
        this.settingsModalElements.avatarPreview.src = preview;
        this.settingsModalElements.avatarPreview.style.display = 'block';
      }
      if (this.settingsModalElements.avatar) {
        this.settingsModalElements.avatar.src = preview;
      }
    } catch (error) {
      console.error('Preview error:', error);
    }

    // Compress and upload
    try {
      const compressedFile = await this.avatarService.compressImage(file);
      await this.uploadAvatar(compressedFile);
    } catch (error) {
      console.error('Avatar processing error:', error);
      this.showToast('Failed to process avatar', 'error');
    }
  }

  async uploadAvatar(file) {
    if (!navigator.onLine) {
      this.showToast('Cannot upload avatar while offline', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('avatar', file);

    this.showToast('Uploading avatar...', 'info');

    try {
      const response = await fetch('/api/users/avatar', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` },
        body: formData
      });

      const data = await response.json();

      if (response.ok && data.success) {
        this.user.avatar = data.avatar;
        localStorage.setItem('cachedUser', JSON.stringify(this.user));
        this.updateUI();
        this.showToast('Avatar updated', 'success');
      } else {
        this.showToast(data.error || 'Failed to upload avatar', 'error');
      }
    } catch (error) {
      console.error('Avatar upload error:', error);
      this.showToast('Failed to upload avatar', 'error');
    }
  }

  // ============================================
  // MENTIONS
  // ============================================
  handleMentionInput(e) {
    const input = e.target;
    const cursorPos = input.selectionStart;
    const text = input.value;
    const textBeforeCursor = text.substring(0, cursorPos);

    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);

    if (mentionMatch) {
      this.mentionQuery = mentionMatch[1];
      this.searchUsersForMention(this.mentionQuery);
    } else {
      this.hideMentionDropdown();
    }
  }

  searchUsersForMention(query) {
    let users = Array.from(this.onlineUsers.values())
      .filter(u => u.id !== this.user?.id);

    if (query) {
      const lowerQuery = query.toLowerCase();
      users = users.filter(u =>
        u.username.toLowerCase().includes(lowerQuery) ||
        (u.displayName && u.displayName.toLowerCase().includes(lowerQuery))
      );
    }

    // Sort by relevance and role
    users.sort((a, b) => {
      const roleOrder = { master: 0, admin: 1, moderator: 2, member: 3 };
      return (roleOrder[a.role] || 3) - (roleOrder[b.role] || 3);
    });

    this.mentionUsers = users.slice(0, 10);
    this.mentionIndex = 0;
    this.showMentionDropdown();
  }

  showMentionDropdown() {
    const dropdown = this.mentionElements.dropdown;
    const list = this.mentionElements.list;
    if (!dropdown || !list) return;

    if (this.mentionUsers.length === 0) {
      this.hideMentionDropdown();
      return;
    }

    list.innerHTML = this.mentionUsers.map((user, index) => `
      <div class="mention-item ${index === this.mentionIndex ? 'selected' : ''}" 
           data-user-id="${user.id}" 
           data-username="${user.username}">
        <img class="mention-avatar" src="${user.avatar || this.avatarService.generateDefault(user.username)}" alt="">
        <div class="mention-info">
          <span class="mention-name">${this.escapeHtml(user.displayName || user.username)}</span>
          <span class="mention-username">@${this.escapeHtml(user.username)}</span>
        </div>
        ${this.getRoleBadgeHtml(user.role)}
      </div>
    `).join('');

    list.querySelectorAll('.mention-item').forEach(item => {
      item.addEventListener('click', () => {
        this.selectMention(item.dataset.username);
      });
    });

    dropdown.classList.add('active');
  }

  hideMentionDropdown() {
    this.mentionElements.dropdown?.classList.remove('active');
    this.mentionQuery = null;
    this.mentionUsers = [];
    this.mentionIndex = 0;
  }

  navigateMention(direction) {
    if (this.mentionUsers.length === 0) return;

    this.mentionIndex = Math.max(0, Math.min(
      this.mentionUsers.length - 1,
      this.mentionIndex + direction
    ));

    const items = this.mentionElements.list?.querySelectorAll('.mention-item');
    items?.forEach((item, index) => {
      item.classList.toggle('selected', index === this.mentionIndex);
    });

    // Scroll to selected item
    const selected = this.mentionElements.list?.querySelector('.mention-item.selected');
    selected?.scrollIntoView({ block: 'nearest' });
  }

  selectCurrentMention() {
    const user = this.mentionUsers[this.mentionIndex];
    if (user) {
      this.selectMention(user.username);
    }
  }

  selectMention(username) {
    const input = this.chatElements.messageInput;
    if (!input) return;

    const cursorPos = input.selectionStart;
    const text = input.value;
    const textBeforeCursor = text.substring(0, cursorPos);
    const textAfterCursor = text.substring(cursorPos);

    const mentionStart = textBeforeCursor.lastIndexOf('@');
    if (mentionStart === -1) return;

    const newText = text.substring(0, mentionStart) + '@' + username + ' ' + textAfterCursor;
    input.value = newText;

    const newCursorPos = mentionStart + username.length + 2;
    input.focus();
    input.setSelectionRange(newCursorPos, newCursorPos);

    this.hideMentionDropdown();
  }

  handleMentionClick(username) {
    const user = Array.from(this.onlineUsers.values()).find(
      u => u.username.toLowerCase() === username.toLowerCase()
    );
    if (user) {
      this.openUserProfile(user.id);
    } else {
      this.showToast('User not found or offline', 'info');
    }
  }
  // ============================================
  // DIRECT MESSAGES (WITH OFFLINE SUPPORT)
  // ============================================
  async loadDMConversations() {
    if (!navigator.onLine) {
      const cached = localStorage.getItem('cachedDMConversations');
      if (cached) {
        try {
          this.dmConversations = JSON.parse(cached);
          this.renderDMList();
        } catch (e) {
          console.error('Failed to load cached DM conversations:', e);
        }
      }
      return;
    }

    try {
      const response = await this.apiRequest('/api/dm', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      if (response.conversations) {
        this.dmConversations = response.conversations;
        localStorage.setItem('cachedDMConversations', JSON.stringify(response.conversations));
        this.renderDMList();
      }
    } catch (error) {
      console.error('Error loading DM conversations:', error);
      const cached = localStorage.getItem('cachedDMConversations');
      if (cached) {
        try {
          this.dmConversations = JSON.parse(cached);
          this.renderDMList();
        } catch (e) {
          console.error('Failed to load cached DM conversations:', e);
        }
      }
    }
  }

  renderDMList() {
    const container = this.sidebarElements.dmList;
    if (!container) return;

    if (this.dmConversations.length === 0) {
      container.innerHTML = `
        <div class="dm-empty-hint">
          <i class="fas fa-comments"></i>
          <p>No conversations yet</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.dmConversations.map(conv => {
      const user = conv.participant;
      const isOnline = this.onlineUsers.has(user.id);
      const status = isOnline ? (this.onlineUsers.get(user.id)?.status || 'online') : 'offline';
      const unreadClass = conv.unreadCount > 0 ? 'has-unread' : '';

      return `
        <div class="dm-item ${unreadClass}" data-user-id="${user.id}" data-tooltip="${this.escapeHtml(user.displayName || user.username)}">
          <div class="user-avatar-container">
            <img class="user-avatar" src="${user.avatar || this.avatarService.generateDefault(user.username)}" alt="">
            <span class="status-dot ${status}"></span>
          </div>
          <div class="dm-info">
            <span class="dm-name">${this.escapeHtml(user.displayName || user.username)}</span>
            ${conv.lastMessage ? `
              <span class="dm-preview">${this.escapeHtml(this.truncateText(conv.lastMessage.text, 25))}</span>
            ` : ''}
          </div>
          ${conv.unreadCount > 0 ? `<span class="dm-badge">${conv.unreadCount > 99 ? '99+' : conv.unreadCount}</span>` : ''}
        </div>
      `;
    }).join('');

    container.querySelectorAll('.dm-item').forEach(item => {
      item.addEventListener('click', () => {
        this.openDMChat(item.dataset.userId);
      });
    });
  }

  openNewDMModal() {
    this.populateDMUsersList();
    this.openModal('newDM');
  }

  populateDMUsersList() {
    const users = Array.from(this.onlineUsers.values())
      .filter(u => u.id !== this.user?.id)
      .sort((a, b) => {
        const roleOrder = { master: 0, admin: 1, moderator: 2, member: 3 };
        return (roleOrder[a.role] || 3) - (roleOrder[b.role] || 3);
      });

    const container = this.newDMElements.usersList;
    if (!container) return;

    if (users.length === 0) {
      container.innerHTML = `
        <div class="dm-empty-state">
          <i class="fas fa-users"></i>
          <p>No users online</p>
        </div>
      `;
      return;
    }

    container.innerHTML = users.map(user => `
      <div class="dm-user-item" data-user-id="${user.id}">
        <div class="user-avatar-container">
          <img class="user-avatar" src="${user.avatar || this.avatarService.generateDefault(user.username)}" alt="">
          <span class="status-dot ${user.status || 'online'}"></span>
        </div>
        <div class="dm-user-item-info">
          <span class="dm-user-item-name">
            ${this.escapeHtml(user.displayName || user.username)}
            ${this.getRoleBadgeHtml(user.role)}
          </span>
          <span class="dm-user-item-status">${this.getStatusText(user.status)}</span>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.dm-user-item').forEach(item => {
      item.addEventListener('click', () => {
        this.closeAllModals();
        this.openDMChat(item.dataset.userId);
      });
    });
  }

  getStatusText(status) {
    const statusTexts = {
      online: 'Online',
      away: 'Away',
      dnd: 'Do Not Disturb',
      invisible: 'Invisible',
      offline: 'Offline'
    };
    return statusTexts[status] || 'Online';
  }

  filterDMUsers(query) {
    if (!query) {
      this.populateDMUsersList();
      return;
    }

    const lowerQuery = query.toLowerCase();
    const users = Array.from(this.onlineUsers.values())
      .filter(u => u.id !== this.user?.id)
      .filter(u =>
        u.username.toLowerCase().includes(lowerQuery) ||
        (u.displayName && u.displayName.toLowerCase().includes(lowerQuery))
      );

    const container = this.newDMElements.usersList;
    if (!container) return;

    if (users.length === 0) {
      container.innerHTML = `
        <div class="dm-empty-state">
          <i class="fas fa-search"></i>
          <p>No users found</p>
        </div>
      `;
      return;
    }

    container.innerHTML = users.map(user => `
      <div class="dm-user-item" data-user-id="${user.id}">
        <div class="user-avatar-container">
          <img class="user-avatar" src="${user.avatar || this.avatarService.generateDefault(user.username)}" alt="">
          <span class="status-dot ${user.status || 'online'}"></span>
        </div>
        <div class="dm-user-item-info">
          <span class="dm-user-item-name">${this.escapeHtml(user.displayName || user.username)}</span>
          <span class="dm-user-item-status">${this.getStatusText(user.status)}</span>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.dm-user-item').forEach(item => {
      item.addEventListener('click', () => {
        this.closeAllModals();
        this.openDMChat(item.dataset.userId);
      });
    });
  }

  async openDMChat(userId) {
    const user = this.onlineUsers.get(userId) || 
                 this.dmConversations.find(c => c.participant.id === userId)?.participant;

    if (!user) {
      this.showToast('User not found', 'error');
      return;
    }

    this.currentDM = userId;
    this.renderedDMIds.clear();

    if (this.dmElements.userAvatar) {
      this.dmElements.userAvatar.src = user.avatar || this.avatarService.generateDefault(user.username);
    }
    if (this.dmElements.userName) {
      this.dmElements.userName.innerHTML = `
        ${this.escapeHtml(user.displayName || user.username)}
        ${this.getRoleBadgeHtml(user.role)}
      `;
    }
    const isOnline = this.onlineUsers.has(userId);
    const status = isOnline ? (this.onlineUsers.get(userId)?.status || 'online') : 'offline';
    if (this.dmElements.userStatus) {
      this.dmElements.userStatus.className = `status-indicator ${status}`;
    }
    if (this.dmElements.userStatusText) {
      this.dmElements.userStatusText.textContent = this.getStatusText(status);
    }

    this.dmElements.view?.classList.add('active');
    await this.loadDMMessages(userId);
  }

  async loadDMMessages(userId) {
    if (!navigator.onLine) {
      const cached = localStorage.getItem(`cachedDM_${userId}`);
      if (cached) {
        try {
          const messages = JSON.parse(cached);
          this.renderDMMessages(messages);
          this.showToast('Showing cached messages', 'info');
        } catch (e) {
          console.error('Failed to load cached DM messages:', e);
        }
      }
      return;
    }

    try {
      const response = await this.apiRequest(`/api/dm/${userId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      if (response.messages) {
        this.renderDMMessages(response.messages);
        localStorage.setItem(`cachedDM_${userId}`, JSON.stringify(response.messages));
      }
    } catch (error) {
      console.error('Error loading DM messages:', error);
      const cached = localStorage.getItem(`cachedDM_${this.currentDM}`);
      if (cached) {
        try {
          const messages = JSON.parse(cached);
          this.renderDMMessages(messages);
        } catch (e) {
          console.error('Failed to load cached DM messages:', e);
        }
      }
    }
  }

  renderDMMessages(messages) {
    const container = this.dmElements.messages;
    if (!container) return;

    this.renderedDMIds.clear();

    if (!messages || messages.length === 0) {
      container.innerHTML = `
        <div class="dm-empty-state">
          <i class="fas fa-comments"></i>
          <p>No messages yet</p>
          <span>Start the conversation!</span>
        </div>
      `;
      return;
    }

    container.innerHTML = messages.map(msg => {
      this.renderedDMIds.add(msg.id);
      const isOwn = msg.userId === this.user?.id;
      const avatar = msg.avatar || this.avatarService.generateDefault(msg.username);
      const time = this.formatTime(msg.createdAt);
      const pendingClass = msg.pending ? 'pending' : '';
      const alignmentClass = this.settings.messageAlignment === 'right' && isOwn ? 'aligned-right' : '';

      return `
        <div class="message ${isOwn ? 'own' : ''} ${pendingClass} ${alignmentClass}" data-message-id="${msg.id}">
          ${this.settings.showAvatars ? `<img class="message-avatar" src="${avatar}" alt="">` : ''}
          <div class="message-content">
            <div class="message-header">
              <span class="message-author">${this.escapeHtml(msg.displayName || msg.username)}</span>
              ${this.settings.showTimestamps ? `<span class="message-time">${time}</span>` : ''}
            </div>
            <div class="message-text">${this.formatMessageText(msg.text)}</div>
            ${msg.pending ? '<div class="pending-indicator"><i class="fas fa-clock"></i> Sending...</div>' : ''}
          </div>
        </div>
      `;
    }).join('');

    const scrollContainer = this.dmElements.messagesContainer;
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }

  async sendDMMessage() {
    const input = this.dmElements.input;
    if (!input) return;

    const text = input.value?.trim();
    if (!text || !this.currentDM) return;

    input.value = '';
    input.style.height = 'auto';

    const sendBtn = this.dmElements.sendBtn;
    if (sendBtn) sendBtn.disabled = true;

    if (!navigator.onLine) {
      const queued = this.pollingService.queueOfflineMessage({
        type: 'dm',
        recipientId: this.currentDM,
        text: text,
        isDM: true
      });
      
      this.showPendingDMMessage(queued);
      this.showToast('Message queued - will send when online', 'info');
      
      if (sendBtn) sendBtn.disabled = false;
      input.focus();
      return;
    }

    try {
      const response = await this.apiRequest(`/api/dm/${this.currentDM}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` },
        body: JSON.stringify({ text })
      });

      if (response.success) {
        this.appendDMMessage(response.message);
        this.updateDMCache(this.currentDM, response.message);
        this.playSound('sent');
      } else {
        const queued = this.pollingService.queueOfflineMessage({
          type: 'dm',
          recipientId: this.currentDM,
          text: text,
          isDM: true
        });
        this.showPendingDMMessage(queued);
        this.showToast(response.error || 'Message queued - will retry', 'warning');
      }
    } catch (error) {
      console.error('Error sending DM:', error);
      const queued = this.pollingService.queueOfflineMessage({
        type: 'dm',
        recipientId: this.currentDM,
        text: text,
        isDM: true
      });
      this.showPendingDMMessage(queued);
      this.showToast('Message queued - will retry when connected', 'warning');
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      input.focus();
    }
  }

  async syncDMMessageToServer(message) {
    const response = await this.apiRequest(`/api/dm/${message.recipientId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.token}` },
      body: JSON.stringify({ text: message.text })
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to send DM');
    }

    return response.message;
  }

  showPendingDMMessage(message) {
    this.appendDMMessage({
      id: message.id,
      userId: this.user?.id,
      username: this.user?.username,
      displayName: this.user?.displayName,
      avatar: this.user?.avatar,
      text: message.text,
      createdAt: new Date(message.queuedAt).toISOString(),
      pending: true
    });
  }

  updateDMCache(userId, message) {
    const cached = localStorage.getItem(`cachedDM_${userId}`);
    let messages = [];
    if (cached) {
      try {
        messages = JSON.parse(cached);
      } catch (e) {
        messages = [];
      }
    }
    messages.push(message);
    localStorage.setItem(`cachedDM_${userId}`, JSON.stringify(messages.slice(-CONFIG.MESSAGE_CACHE_LIMIT)));
  }

  appendDMMessage(message) {
    const container = this.dmElements.messages;
    if (!container) return;

    if (this.renderedDMIds.has(message.id)) return;
    this.renderedDMIds.add(message.id);

    container.querySelector('.dm-empty-state')?.remove();

    const isOwn = message.userId === this.user?.id;
    const avatar = message.avatar || this.avatarService.generateDefault(message.username);
    const time = this.formatTime(message.createdAt);
    const alignmentClass = this.settings.messageAlignment === 'right' && isOwn ? 'aligned-right' : '';

    const messageEl = document.createElement('div');
    messageEl.className = `message ${isOwn ? 'own' : ''} ${message.pending ? 'pending' : ''} ${alignmentClass}`;
    messageEl.dataset.messageId = message.id;
    messageEl.innerHTML = `
      ${this.settings.showAvatars ? `<img class="message-avatar" src="${avatar}" alt="">` : ''}
      <div class="message-content">
        <div class="message-header">
          <span class="message-author">${this.escapeHtml(message.displayName || message.username)}</span>
          ${this.settings.showTimestamps ? `<span class="message-time">${time}</span>` : ''}
        </div>
        <div class="message-text">${this.formatMessageText(message.text)}</div>
        ${message.pending ? '<div class="pending-indicator"><i class="fas fa-clock"></i> Sending...</div>' : ''}
      </div>
    `;

    container.appendChild(messageEl);

    const scrollContainer = this.dmElements.messagesContainer;
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
  }

  closeDMChat() {
    this.currentDM = null;
    this.renderedDMIds.clear();
    this.dmElements.view?.classList.remove('active');
    if (this.dmElements.messages) this.dmElements.messages.innerHTML = '';
    if (this.dmElements.input) this.dmElements.input.value = '';
  }

  handleDMReceived(data) {
    if (this.renderedDMIds.has(data.message.id)) return;

    if (this.dmElements.view?.classList.contains('active') && this.currentDM === data.message.userId) {
      this.appendDMMessage(data.message);
      this.updateDMCache(this.currentDM, data.message);
    } else {
      this.showToast(`New message from ${data.message.displayName || data.message.username}`, 'info');
      this.playSound('notification');
    }

    this.loadDMConversations();
  }

  sendDMFromProfile() {
    const modal = this.modals.userProfile;
    const usernameEl = modal?.querySelector('.profile-username');
    if (!usernameEl) return;

    const username = usernameEl.textContent?.replace('@', '');
    const user = Array.from(this.onlineUsers.values()).find(u => u.username === username);

    if (user) {
      this.closeAllModals();
      this.openDMChat(user.id);
    } else {
      this.showToast('User is offline', 'warning');
    }
  }

  // ============================================
  // THREADS
  // ============================================
  async openThread(messageId) {
    if (!navigator.onLine) {
      this.showToast('Threads not available offline', 'warning');
      return;
    }

    try {
      const response = await this.apiRequest(`/api/threads/${messageId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      if (response.error) {
        this.showToast(response.error, 'error');
        return;
      }

      this.currentThread = messageId;
      this.renderThreadPanel(response.parentMessage, response.replies || []);
    } catch (error) {
      console.error('Error loading thread:', error);
      this.showToast('Failed to load thread', 'error');
    }
  }

  renderThreadPanel(parentMessage, replies) {
    const panel = this.threadElements.panel;
    const parentContainer = this.threadElements.parent;
    const repliesContainer = this.threadElements.replies;

    if (!panel || !parentContainer || !repliesContainer) return;

    const parentAvatar = parentMessage.avatar || this.avatarService.generateDefault(parentMessage.username);
    parentContainer.innerHTML = `
      <div class="thread-message parent">
        <img class="message-avatar" src="${parentAvatar}" alt="">
        <div class="message-content">
          <div class="message-header">
            <span class="message-author">${this.escapeHtml(parentMessage.displayName || parentMessage.username)}</span>
            <span class="message-time">${this.formatTime(parentMessage.createdAt)}</span>
          </div>
          <div class="message-text">${this.formatMessageText(parentMessage.text)}</div>
        </div>
      </div>
    `;

    if (replies.length === 0) {
      repliesContainer.innerHTML = `
        <div class="thread-empty">
          <i class="fas fa-comments"></i>
          <p>No replies yet</p>
        </div>
      `;
    } else {
      repliesContainer.innerHTML = replies.map(reply => {
        const avatar = reply.avatar || this.avatarService.generateDefault(reply.username);
        return `
          <div class="thread-message reply">
            <img class="message-avatar" src="${avatar}" alt="">
            <div class="message-content">
              <div class="message-header">
                <span class="message-author">${this.escapeHtml(reply.displayName || reply.username)}</span>
                <span class="message-time">${this.formatTime(reply.createdAt)}</span>
              </div>
              <div class="message-text">${this.formatMessageText(reply.text)}</div>
            </div>
          </div>
        `;
      }).join('');
    }

    panel.classList.add('active');
    this.closePinnedPanel();
    this.threadElements.input?.focus();
  }

  async sendThreadReply() {
    const input = this.threadElements.input;
    const text = input?.value?.trim();

    if (!text || !this.currentThread) return;

    if (!navigator.onLine) {
      this.showToast('Cannot send reply while offline', 'warning');
      return;
    }

    try {
      const response = await this.apiRequest(`/api/threads/${this.currentThread}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` },
        body: JSON.stringify({ text })
      });

      if (response.success) {
        this.appendThreadReply(response.message);
        if (input) input.value = '';
        this.playSound('sent');
      } else {
        this.showToast(response.error || 'Failed to send reply', 'error');
      }
    } catch (error) {
      console.error('Error sending thread reply:', error);
      this.showToast('Failed to send reply', 'error');
    }
  }

  appendThreadReply(message) {
    const container = this.threadElements.replies;
    if (!container) return;

    container.querySelector('.thread-empty')?.remove();

    const avatar = message.avatar || this.avatarService.generateDefault(message.username);
    const replyEl = document.createElement('div');
    replyEl.className = 'thread-message reply new';
    replyEl.innerHTML = `
      <img class="message-avatar" src="${avatar}" alt="">
      <div class="message-content">
        <div class="message-header">
          <span class="message-author">${this.escapeHtml(message.displayName || message.username)}</span>
          <span class="message-time">${this.formatTime(message.createdAt)}</span>
        </div>
        <div class="message-text">${this.formatMessageText(message.text)}</div>
      </div>
    `;

    container.appendChild(replyEl);
    container.scrollTop = container.scrollHeight;

    setTimeout(() => replyEl.classList.remove('new'), 500);
  }

  handleThreadReplyReceived(data) {
    if (this.currentThread === data.parentMessageId) {
      this.appendThreadReply(data.message);
    }
  }

  closeThreadPanel() {
    this.threadElements.panel?.classList.remove('active');
    this.currentThread = null;
  }

  // ============================================
  // PINNED MESSAGES
  // ============================================
  async loadPinnedMessages() {
    if (!navigator.onLine) {
      this.showToast('Pinned messages not available offline', 'warning');
      return;
    }

    try {
      const response = await this.apiRequest(`/api/rooms/${this.currentRoom}/pins`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      this.pinnedMessages = response.pinnedMessages || [];
      this.renderPinnedMessages();
    } catch (error) {
      console.error('Error loading pinned messages:', error);
    }
  }

  renderPinnedMessages() {
    const container = this.pinnedElements.list;
    if (!container) return;

    if (this.pinnedMessages.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-thumbtack"></i>
          <p>No pinned messages</p>
          <span class="empty-hint">Pin important messages to find them easily</span>
        </div>
      `;
      return;
    }

    container.innerHTML = this.pinnedMessages.map(msg => {
      const avatar = msg.avatar || this.avatarService.generateDefault(msg.username);
      return `
        <div class="pinned-message" onclick="app.scrollToMessage('${msg.id}'); app.closePinnedPanel();">
          <div class="pinned-message-header">
            <img class="message-avatar" src="${avatar}" alt="">
            <span class="message-author">${this.escapeHtml(msg.displayName || msg.username)}</span>
            <span class="message-time">${this.formatTime(msg.createdAt)}</span>
            <button class="btn-icon-tiny unpin-btn" onclick="event.stopPropagation(); app.unpinMessage('${msg.id}');" title="Unpin">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="pinned-text">${this.escapeHtml(this.truncateText(msg.text, 100))}</div>
        </div>
      `;
    }).join('');
  }

  togglePinnedPanel() {
    const panel = this.pinnedElements.panel;
    if (!panel) return;

    if (panel.classList.contains('active')) {
      this.closePinnedPanel();
    } else {
      this.loadPinnedMessages();
      panel.classList.add('active');
      this.closeThreadPanel();
    }
  }

  closePinnedPanel() {
    this.pinnedElements.panel?.classList.remove('active');
  }

  async pinMessage(messageId) {
    if (!navigator.onLine) {
      this.showToast('Cannot pin message while offline', 'warning');
      return;
    }

    try {
      const response = await this.apiRequest(`/api/rooms/${this.currentRoom}/pin`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` },
        body: JSON.stringify({ messageId })
      });

      if (response.success) {
        this.showToast('Message pinned', 'success');
      } else {
        this.showToast(response.error || 'Failed to pin message', 'error');
      }
    } catch (error) {
      console.error('Error pinning message:', error);
      this.showToast('Failed to pin message', 'error');
    }
  }

  async unpinMessage(messageId) {
    if (!navigator.onLine) {
      this.showToast('Cannot unpin message while offline', 'warning');
      return;
    }

    try {
      const response = await this.apiRequest(`/api/rooms/${this.currentRoom}/pin/${messageId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      if (response.success) {
        this.loadPinnedMessages();
        this.showToast('Message unpinned', 'success');
      }
    } catch (error) {
      console.error('Error unpinning message:', error);
    }
  }

  handleMessagePinned(data) {
    this.showToast('A message was pinned', 'info');
    if (this.pinnedElements.panel?.classList.contains('active')) {
      this.loadPinnedMessages();
    }
  }

  handleMessageUnpinned(data) {
    if (this.pinnedElements.panel?.classList.contains('active')) {
      this.loadPinnedMessages();
    }
  }

  // ============================================
  // USERS & ADMIN PANEL
  // ============================================
  updateUsersList() {
    const container = this.sidebarElements.usersList;
    if (!container) return;

    const sortedUsers = Array.from(this.onlineUsers.values()).sort((a, b) => {
      if (a.id === this.user?.id) return -1;
      if (b.id === this.user?.id) return 1;
      
      const roleOrder = { master: 0, admin: 1, moderator: 2, member: 3 };
      const roleDiff = (roleOrder[a.role] || 3) - (roleOrder[b.role] || 3);
      if (roleDiff !== 0) return roleDiff;
      
      const statusOrder = { online: 0, away: 1, dnd: 2, invisible: 3, offline: 4 };
      return (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
    });

    container.innerHTML = sortedUsers.map(user => {
      const displayName = user.displayName || user.username;
      const avatar = user.avatar || this.avatarService.generateDefault(user.username);
      const isYou = user.id === this.user?.id;

      return `
        <div class="user-item" data-user-id="${user.id}" data-tooltip="${this.escapeHtml(displayName)}">
          <div class="user-avatar-container">
            <img class="user-avatar" src="${avatar}" alt="">
            <span class="status-dot ${user.status || 'online'}"></span>
          </div>
          <div class="user-info">
            <span class="user-name">
              ${this.escapeHtml(displayName)}
              ${this.getRoleBadgeHtml(user.role)}
            </span>
            ${isYou ? '<span class="you-badge">you</span>' : ''}
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.user-item').forEach(item => {
      item.addEventListener('click', () => {
        this.openUserProfile(item.dataset.userId);
      });

      // Right-click for admin actions
      item.addEventListener('contextmenu', (e) => {
        if (this.adminService.canManageUser(item.dataset.userId)) {
          e.preventDefault();
          this.showUserContextMenu(e, item.dataset.userId);
        }
      });
    });

    if (this.sidebarElements.onlineCount) {
      this.sidebarElements.onlineCount.textContent = this.onlineUsers.size;
    }
    if (this.headerElements.membersCount) {
      this.headerElements.membersCount.textContent = this.onlineUsers.size;
    }
  }

  showUserContextMenu(event, userId) {
    const user = this.onlineUsers.get(userId);
    if (!user) return;

    let menu = document.getElementById('user-context-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'user-context-menu';
      menu.className = 'context-menu';
      document.body.appendChild(menu);
    }

    const isMaster = this.adminService.isMaster();
    const isAdmin = this.user?.role === CONFIG.USER_ROLES.ADMIN;

    menu.innerHTML = `
      <div class="context-menu-header">${this.escapeHtml(user.displayName || user.username)}</div>
      <div class="context-menu-item" data-action="view-profile">
        <i class="fas fa-user"></i> View Profile
      </div>
      <div class="context-menu-item" data-action="send-dm">
        <i class="fas fa-envelope"></i> Send Message
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item" data-action="kick">
        <i class="fas fa-user-slash"></i> Kick from Channel
      </div>
      <div class="context-menu-item" data-action="mute">
        <i class="fas fa-volume-mute"></i> Mute
      </div>
      <div class="context-menu-item warning" data-action="ban-room">
        <i class="fas fa-ban"></i> Ban from Channel
      </div>
      ${isMaster || isAdmin ? `
        <div class="context-menu-divider"></div>
        <div class="context-menu-item warning" data-action="ban-global">
          <i class="fas fa-user-lock"></i> Ban Globally
        </div>
        ${isMaster ? `
          <div class="context-menu-item" data-action="change-role">
            <i class="fas fa-user-tag"></i> Change Role
          </div>
          <div class="context-menu-item danger" data-action="delete-account">
            <i class="fas fa-user-times"></i> Delete Account
          </div>
        ` : ''}
      ` : ''}
    `;

    menu.style.left = `${event.pageX}px`;
    menu.style.top = `${event.pageY}px`;
    menu.classList.add('active');

    const handleAction = async (e) => {
      const action = e.target.closest('.context-menu-item')?.dataset.action;
      if (!action) return;

      menu.classList.remove('active');

      switch (action) {
        case 'view-profile':
          this.openUserProfile(userId);
          break;
        case 'send-dm':
          this.openDMChat(userId);
          break;
        case 'kick':
          await this.adminService.kickUserFromRoom(userId, this.currentRoom);
          break;
        case 'mute':
          this.showMuteModal(userId);
          break;
        case 'ban-room':
          this.showBanModal(userId, 'room');
          break;
        case 'ban-global':
          this.showBanModal(userId, 'global');
          break;
        case 'change-role':
          this.showChangeRoleModal(userId);
          break;
        case 'delete-account':
          this.confirmDeleteUserAccount(userId);
          break;
      }
    };

    menu.addEventListener('click', handleAction, { once: true });

    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.classList.remove('active');
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  }

  showMuteModal(userId) {
    const user = this.onlineUsers.get(userId);
    if (!user) return;

    this.showConfirmModal(
      'Mute User',
      `
        <p>Mute ${this.escapeHtml(user.displayName || user.username)}?</p>
        <select id="mute-duration-select" class="modal-select">
          <option value="5">5 minutes</option>
          <option value="15">15 minutes</option>
          <option value="30">30 minutes</option>
          <option value="60">1 hour</option>
          <option value="1440">24 hours</option>
        </select>
      `,
      async () => {
        const duration = parseInt(document.getElementById('mute-duration-select')?.value || '15');
        await this.adminService.muteUserInRoom(userId, this.currentRoom, duration);
      },
      'Mute',
      'warning',
      true
    );
  }

  showBanModal(userId, type = 'room') {
    const user = this.onlineUsers.get(userId);
    if (!user) return;

    const title = type === 'global' ? 'Ban User Globally' : 'Ban from Channel';

    this.showConfirmModal(
      title,
      `
        <p>Ban ${this.escapeHtml(user.displayName || user.username)}?</p>
        <input type="text" id="ban-reason-input" class="modal-input" placeholder="Reason (optional)">
        ${type === 'global' ? `
          <select id="ban-duration-select" class="modal-select">
            <option value="">Permanent</option>
            <option value="1">1 day</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
          </select>
        ` : ''}
      `,
      async () => {
        const reason = document.getElementById('ban-reason-input')?.value || '';
        const durationEl = document.getElementById('ban-duration-select');
        const duration = durationEl ? (durationEl.value ? parseInt(durationEl.value) + ' days' : null) : null;

        if (type === 'global') {
          await this.adminService.banUser(userId, reason, duration);
        } else {
          await this.adminService.banUserFromRoom(userId, this.currentRoom, reason);
        }
      },
      'Ban',
      'danger',
      true
    );
  }

  showChangeRoleModal(userId) {
    const user = this.onlineUsers.get(userId);
    if (!user) return;

    this.showConfirmModal(
      'Change User Role',
      `
        <p>Change role for ${this.escapeHtml(user.displayName || user.username)}</p>
        <select id="role-select" class="modal-select">
          <option value="member" ${user.role === 'member' ? 'selected' : ''}>Member</option>
          <option value="moderator" ${user.role === 'moderator' ? 'selected' : ''}>Moderator</option>
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      `,
      async () => {
        const role = document.getElementById('role-select')?.value;
        if (role) {
          await this.adminService.setUserRole(userId, role);
        }
      },
      'Change Role',
      'primary',
      true
    );
  }

  confirmDeleteUserAccount(userId) {
    const user = this.onlineUsers.get(userId);
    if (!user) return;

    this.showConfirmModal(
      'Delete User Account',
      `<p class="danger-text">⚠️ This action cannot be undone!</p>
       <p>Are you sure you want to permanently delete the account of <strong>${this.escapeHtml(user.displayName || user.username)}</strong>?</p>
       <p>All their messages, data, and settings will be removed.</p>`,
      async () => {
        await this.adminService.deleteUserAccount(userId);
      },
      'Delete Account',
      'danger'
    );
  }

  handleUserStatusChange(data) {
    if (data.status === 'offline') {
      this.onlineUsers.delete(data.userId);
    } else {
      this.onlineUsers.set(data.userId, {
        id: data.userId,
        username: data.username,
        displayName: data.displayName,
        avatar: data.avatar,
        status: data.status,
        role: data.role
      });
    }

    this.updateUsersList();
    this.renderDMList();
  }

  async openUserProfile(userId) {
    const user = this.onlineUsers.get(userId);
    
    if (!navigator.onLine && user) {
      this.showCachedUserProfile(user);
      return;
    }

    try {
      const response = await this.apiRequest(`/api/users/${userId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      if (response.user) {
        this.showUserProfileModal(response.user, userId);
      } else if (user) {
        this.showCachedUserProfile(user);
      } else {
        this.showToast('User not found', 'error');
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
      if (user) {
        this.showCachedUserProfile(user);
      } else {
        this.showToast('Failed to load profile', 'error');
      }
    }
  }

  showCachedUserProfile(user) {
    this.showUserProfileModal(user, user.id);
  }

  showUserProfileModal(user, userId) {
    const modal = this.modals.userProfile;
    if (!modal) return;

    const avatar = user.avatar || this.avatarService.generateDefault(user.username);
    const isOnline = this.onlineUsers.has(userId);
    const status = isOnline ? (this.onlineUsers.get(userId)?.status || 'online') : 'offline';
    const canManage = this.adminService.canManageUser(userId) && userId !== this.user?.id;

    modal.querySelector('.profile-avatar').src = avatar;
    modal.querySelector('.profile-status-indicator').className = `profile-status-indicator ${status}`;
    modal.querySelector('.profile-name').innerHTML = `
      ${this.escapeHtml(user.displayName || user.username)}
      ${this.getRoleBadgeHtml(user.role)}
    `;
    modal.querySelector('.profile-username').textContent = `@${user.username}`;
    
    const badgeEl = modal.querySelector('.profile-status-badge');
    badgeEl.textContent = this.getStatusText(status);
    badgeEl.className = `profile-status-badge ${status}`;
    
    modal.querySelector('.profile-bio').textContent = user.bio || 'No bio yet';
    modal.querySelector('.profile-joined').textContent = this.formatDateFull(user.createdAt);
    modal.querySelector('.profile-user-id').textContent = user.id;

    // Show/hide manage button
    const manageBtn = modal.querySelector('#manage-user-btn');
    if (manageBtn) {
      manageBtn.style.display = canManage ? 'flex' : 'none';
      manageBtn.dataset.userId = userId;
    }

    this.selectedUserForAdmin = userId;
    this.openModal('userProfile');
  }

  openUserManagement() {
    if (!this.selectedUserForAdmin) return;
    this.closeAllModals();
    this.showUserContextMenu({ pageX: window.innerWidth / 2, pageY: window.innerHeight / 2 }, this.selectedUserForAdmin);
  }

  changeStatus(status) {
    if (!navigator.onLine) {
      this.showToast('Cannot change status while offline', 'warning');
      return;
    }

    this.wsSend({
      type: 'status_change',
      status
    });

    const indicator = document.querySelector('.user-profile .status-indicator');
    if (indicator) {
      indicator.className = `status-indicator ${status}`;
    }

    this.showToast(`Status changed to ${this.getStatusText(status)}`, 'success');
  }

  // ============================================
  // ADMIN PANEL
  // ============================================
  toggleAdminPanel() {
    if (!this.adminService.isMaster() && this.user?.role !== CONFIG.USER_ROLES.ADMIN) {
      this.showToast('Access denied', 'error');
      return;
    }

    if (this.adminPanelOpen) {
      this.closeAdminPanel();
    } else {
      this.openAdminPanel();
    }
  }

  async openAdminPanel() {
    this.adminPanelOpen = true;
    this.adminElements.panel?.classList.add('active');
    
    // Load admin data
    await this.loadAdminStats();
    await this.loadAdminUserList();
    await this.loadBannedUsers();
  }

  closeAdminPanel() {
    this.adminPanelOpen = false;
    this.adminElements.panel?.classList.remove('active');
  }

  switchAdminTab(tab) {
    this.adminElements.tabs?.forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });

    this.adminElements.tabContents?.forEach(content => {
      content.classList.toggle('active', content.dataset.tab === tab);
    });
  }

  async loadAdminStats() {
    const stats = await this.adminService.getSystemStats();
    if (!stats || !this.adminElements.statsContainer) return;

    this.adminElements.statsContainer.innerHTML = `
      <div class="stat-card">
        <i class="fas fa-users"></i>
        <div class="stat-info">
          <span class="stat-value">${stats.totalUsers || 0}</span>
          <span class="stat-label">Total Users</span>
        </div>
      </div>
      <div class="stat-card">
        <i class="fas fa-user-check"></i>
        <div class="stat-info">
          <span class="stat-value">${stats.onlineUsers || 0}</span>
          <span class="stat-label">Online Now</span>
        </div>
      </div>
      <div class="stat-card">
        <i class="fas fa-comments"></i>
        <div class="stat-info">
          <span class="stat-value">${stats.totalMessages || 0}</span>
          <span class="stat-label">Total Messages</span>
        </div>
      </div>
      <div class="stat-card">
        <i class="fas fa-hashtag"></i>
        <div class="stat-info">
          <span class="stat-value">${stats.totalRooms || 0}</span>
          <span class="stat-label">Channels</span>
        </div>
      </div>
      <div class="stat-card">
        <i class="fas fa-user-slash"></i>
        <div class="stat-info">
          <span class="stat-value">${stats.bannedUsers || 0}</span>
          <span class="stat-label">Banned Users</span>
        </div>
      </div>
    `;
  }

  async loadAdminUserList(search = '') {
    const result = await this.adminService.getAllUsers(1, 50, search);
    const container = this.adminElements.userList;
    if (!container) return;

    if (!result.users || result.users.length === 0) {
      container.innerHTML = '<p class="empty-text">No users found</p>';
      return;
    }

    container.innerHTML = result.users.map(user => `
      <div class="admin-user-item" data-user-id="${user.id}">
        <img class="user-avatar" src="${user.avatar || this.avatarService.generateDefault(user.username)}" alt="">
        <div class="admin-user-info">
          <span class="admin-user-name">
            ${this.escapeHtml(user.displayName || user.username)}
            ${this.getRoleBadgeHtml(user.role)}
          </span>
          <span class="admin-user-email">${this.escapeHtml(user.email)}</span>
        </div>
        <div class="admin-user-actions">
          <button class="btn-icon-small" onclick="app.openUserProfile('${user.id}')" title="View">
            <i class="fas fa-eye"></i>
          </button>
          ${this.adminService.canManageUser(user.id) ? `
            <button class="btn-icon-small" onclick="app.showBanModal('${user.id}', 'global')" title="Ban">
              <i class="fas fa-ban"></i>
            </button>
            ${this.adminService.isMaster() ? `
              <button class="btn-icon-small danger" onclick="app.confirmDeleteUserAccount('${user.id}')" title="Delete">
                <i class="fas fa-trash"></i>
              </button>
            ` : ''}
          ` : ''}
        </div>
      </div>
    `).join('');
  }

  async loadBannedUsers() {
    const users = await this.adminService.getBannedUsers();
    const container = this.adminElements.bannedUsersList;
    if (!container) return;

    if (users.length === 0) {
      container.innerHTML = '<p class="empty-text">No banned users</p>';
      return;
    }

    container.innerHTML = users.map(user => `
      <div class="banned-user-item" data-user-id="${user.id}">
        <img class="user-avatar" src="${user.avatar || this.avatarService.generateDefault(user.username)}" alt="">
        <div class="banned-user-info">
          <span class="banned-user-name">${this.escapeHtml(user.displayName || user.username)}</span>
          <span class="banned-user-reason">${user.banReason || 'No reason provided'}</span>
          ${user.banExpires ? `<span class="banned-user-expires">Expires: ${this.formatDateFull(user.banExpires)}</span>` : '<span class="banned-user-expires">Permanent</span>'}
        </div>
        <button class="btn-small btn-success" onclick="app.unbanUser('${user.id}')">
          <i class="fas fa-user-check"></i> Unban
        </button>
      </div>
    `).join('');
  }

  async unbanUser(userId) {
    const success = await this.adminService.unbanUser(userId);
    if (success) {
      this.loadBannedUsers();
    }
  }

  searchUsersAdmin(query) {
    this.loadAdminUserList(query);
  }

  async sendAnnouncement() {
    const input = this.adminElements.announcementInput;
    const message = input?.value?.trim();

    if (!message) {
      this.showToast('Please enter an announcement message', 'warning');
      return;
    }

    const success = await this.adminService.sendSystemAnnouncement(message);
    if (success && input) {
      input.value = '';
    }
  }

  // ============================================
  // SEARCH
  // ============================================
  async searchMessages(query) {
    if (!query || query.length < 2) {
      document.querySelectorAll('.message.search-result').forEach(el => {
        el.classList.remove('search-result');
      });
      return;
    }

    if (!navigator.onLine) {
      this.searchCachedMessages(query);
      return;
    }

    try {
      const response = await this.apiRequest(
        `/api/messages/search/${encodeURIComponent(query)}?roomId=${this.currentRoom}`,
        { 
          method: 'GET',
          headers: { 'Authorization': `Bearer ${this.token}` } 
        }
      );

      if (response.messages) {
        this.highlightSearchResults(response.messages);
      }
    } catch (error) {
      console.error('Search error:', error);
      this.searchCachedMessages(query);
    }
  }

  searchCachedMessages(query) {
    const lowerQuery = query.toLowerCase();
    const roomMessages = this.messages.get(this.currentRoom) || [];
    const matches = roomMessages.filter(msg => 
      msg.text && msg.text.toLowerCase().includes(lowerQuery)
    );
    this.highlightSearchResults(matches);
  }

  highlightSearchResults(messages) {
    document.querySelectorAll('.message.search-result').forEach(el => {
      el.classList.remove('search-result');
    });

    messages.forEach(msg => {
      const el = document.querySelector(`[data-message-id="${msg.id}"]`);
      if (el) {
        el.classList.add('search-result');
      }
    });

    const first = document.querySelector('.message.search-result');
    if (first) {
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      this.showToast(`Found ${messages.length} result(s)`, 'info');
    } else {
      this.showToast('No results found', 'info');
    }
  }

  // ============================================
  // CONTEXT MENU
  // ============================================
  showContextMenu(event, messageEl) {
    this.contextMenuTarget = messageEl;
    const userId = messageEl.dataset.userId;
    const messageId = messageEl.dataset.messageId;
    const isOwn = userId === this.user?.id;
    const isPending = messageEl.classList.contains('pending');
    const canModerate = this.adminService.isRoomModerator(this.currentRoom);

    const menu = this.contextMenu;
    if (!menu) return;

    // Update menu items visibility
    menu.querySelectorAll('[data-action="edit"], [data-action="delete"]').forEach(el => {
      el.style.display = isOwn && !isPending ? 'flex' : 'none';
    });

    menu.querySelectorAll('[data-action="reply"], [data-action="react"], [data-action="pin"], [data-action="thread"]').forEach(el => {
      el.style.display = !isPending ? 'flex' : 'none';
    });

    // Admin actions
    const adminSection = menu.querySelector('.admin-actions');
    if (adminSection) {
      adminSection.style.display = canModerate && !isOwn ? 'block' : 'none';
    }

    menu.style.left = `${event.pageX}px`;
    menu.style.top = `${event.pageY}px`;
    menu.classList.add('active');
  }

  hideContextMenu() {
    this.contextMenu?.classList.remove('active');
    this.contextMenuTarget = null;
  }

  handleContextMenuAction(action) {
    if (!this.contextMenuTarget) return;

    const messageId = this.contextMenuTarget.dataset.messageId;
    const userId = this.contextMenuTarget.dataset.userId;

    switch (action) {
      case 'reply':
        this.replyToMessage(messageId);
        break;
      case 'thread':
        this.openThread(messageId);
        break;
      case 'react':
        this.addReaction(messageId);
        break;
      case 'pin':
        this.pinMessage(messageId);
        break;
      case 'copy':
        const text = this.contextMenuTarget.querySelector('.message-text')?.textContent;
        if (text) {
          navigator.clipboard.writeText(text).then(() => {
            this.showToast('Message copied', 'success');
          });
        }
        break;
      case 'copy-link':
        const link = `${window.location.origin}/${this.currentRoom}?message=${messageId}`;
        navigator.clipboard.writeText(link).then(() => {
          this.showToast('Link copied', 'success');
        });
        break;
      case 'edit':
        this.editMessage(messageId);
        break;
      case 'delete':
        this.deleteMessage(messageId);
        break;
      case 'admin-delete':
        this.adminDeleteMessage(messageId);
        break;
      case 'warn-user':
        this.showToast('Warning sent to user', 'success');
        break;
      case 'mute-user':
        this.showMuteModal(userId);
        break;
      case 'kick-user':
        this.adminService.kickUserFromRoom(userId, this.currentRoom);
        break;
      case 'ban-user':
        this.showBanModal(userId, 'room');
        break;
    }

    this.hideContextMenu();
  }

  // ============================================
  // SIDEBAR MANAGEMENT
  // ============================================
  initSidebar() {
    if (window.innerWidth > 768 && this.sidebarCollapsed) {
      this.sidebarElements.sidebar?.classList.add('collapsed');
      this.updateSidebarToggleIcon();
    }

    // Show admin button if user is admin/master
    this.updateAdminButtonVisibility();
  }

  updateAdminButtonVisibility() {
    const btn = this.sidebarElements.adminPanelBtn;
    if (btn) {
      const showAdmin = this.adminService.isMaster() || this.user?.role === CONFIG.USER_ROLES.ADMIN;
      btn.style.display = showAdmin ? 'flex' : 'none';
    }
  }

  toggleSidebar() {
    if (window.innerWidth <= 768) {
      this.toggleMobileSidebar();
    } else {
      const sidebar = this.sidebarElements.sidebar;
      if (!sidebar) return;

      sidebar.classList.toggle('collapsed');
      this.sidebarCollapsed = sidebar.classList.contains('collapsed');
      localStorage.setItem('sidebarCollapsed', this.sidebarCollapsed);
      this.updateSidebarToggleIcon();
    }
  }

  updateSidebarToggleIcon() {
    const btn = this.sidebarElements.toggleBtn;
    const icon = btn?.querySelector('i');
    if (icon) {
      icon.className = this.sidebarCollapsed ? 'fas fa-chevron-right' : 'fas fa-chevron-left';
    }
  }

  toggleMobileSidebar() {
    this.sidebarOpen ? this.closeMobileSidebar() : this.openMobileSidebar();
  }

  openMobileSidebar() {
    this.sidebarOpen = true;
    this.sidebarElements.sidebar?.classList.add('active');
    this.sidebarElements.overlay?.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  closeMobileSidebar() {
    this.sidebarOpen = false;
    this.sidebarElements.sidebar?.classList.remove('active');
    this.sidebarElements.overlay?.classList.remove('active');
    document.body.style.overflow = '';
  }

  handleResize() {
    if (window.innerWidth > 768) {
      this.closeMobileSidebar();
      if (this.sidebarCollapsed) {
        this.sidebarElements.sidebar?.classList.add('collapsed');
      }
    }
  }

  closeAllPanels() {
    this.closeAllModals();
    this.closeThreadPanel();
    this.closePinnedPanel();
    this.closeAdminPanel();
    this.closeDMChat();
    this.hideContextMenu();
    this.hideMentionDropdown();
    this.chatElements.emojiPicker?.classList.remove('active');
  }

  // ============================================
  // SETTINGS
  // ============================================
  loadSettings() {
    const saved = localStorage.getItem('chatSettings');
    if (saved) {
      try {
        this.settings = { ...this.settings, ...JSON.parse(saved) };
      } catch (e) {
        console.error('Error loading settings:', e);
      }
    }

    // Apply settings
    this.applySettings();
  }

  applySettings() {
    // Apply to UI elements
    if (this.settingsModalElements.soundToggle) {
      this.settingsModalElements.soundToggle.checked = this.settings.soundEnabled;
    }
    if (this.settingsModalElements.desktopNotificationsToggle) {
      this.settingsModalElements.desktopNotificationsToggle.checked = this.settings.desktopNotifications;
    }
    if (this.settingsModalElements.messageAlignmentSelect) {
      this.settingsModalElements.messageAlignmentSelect.value = this.settings.messageAlignment;
    }
    if (this.settingsModalElements.enterToSendToggle) {
      this.settingsModalElements.enterToSendToggle.checked = this.settings.enterToSend;
    }
    if (this.settingsModalElements.showAvatarsToggle) {
      this.settingsModalElements.showAvatarsToggle.checked = this.settings.showAvatars;
    }
    if (this.settingsModalElements.timestampsToggle) {
      this.settingsModalElements.timestampsToggle.checked = this.settings.showTimestamps;
    }
    if (this.settingsModalElements.animationsToggle) {
      this.settingsModalElements.animationsToggle.checked = this.settings.animationsEnabled;
    }
    if (this.settingsModalElements.compactModeToggle) {
      this.settingsModalElements.compactModeToggle.checked = this.settings.compactMode;
    }

    // Apply compact mode
    document.body.classList.toggle('compact-mode', this.settings.compactMode);
    
    // Apply animations
    document.body.classList.toggle('no-animations', !this.settings.animationsEnabled);

    // Apply font size
    document.documentElement.dataset.fontSize = this.settings.fontSize;
  }

  async saveSettings() {
    // Gather settings from UI
    const displayName = this.settingsModalElements.displayName?.value.trim();
    const bio = this.settingsModalElements.bio?.value.trim();
    const theme = this.settingsModalElements.themeSelect?.value;
    
    this.settings.soundEnabled = this.settingsModalElements.soundToggle?.checked ?? true;
    this.settings.desktopNotifications = this.settingsModalElements.desktopNotificationsToggle?.checked ?? false;
    this.settings.messageAlignment = this.settingsModalElements.messageAlignmentSelect?.value || 'right';
    this.settings.enterToSend = this.settingsModalElements.enterToSendToggle?.checked ?? true;
    this.settings.showAvatars = this.settingsModalElements.showAvatarsToggle?.checked ?? true;
    this.settings.showTimestamps = this.settingsModalElements.timestampsToggle?.checked ?? true;
    this.settings.animationsEnabled = this.settingsModalElements.animationsToggle?.checked ?? true;
    this.settings.compactMode = this.settingsModalElements.compactModeToggle?.checked ?? false;
    this.settings.fontSize = this.settingsModalElements.fontSizeSelect?.value || 'medium';

    // Save locally
    localStorage.setItem('chatSettings', JSON.stringify(this.settings));
    this.setTheme(theme);
    this.applySettings();
    this.applyMessageAlignment();

    if (!navigator.onLine) {
      this.closeAllModals();
      this.showToast('Settings saved locally', 'success');
      return;
    }

    try {
      const response = await this.apiRequest('/api/users/profile', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${this.token}` },
        body: JSON.stringify({
          displayName,
          bio,
          theme,
          settings: this.settings
        })
      });

      if (response.success) {
        this.user = response.user;
        localStorage.setItem('cachedUser', JSON.stringify(response.user));
        this.updateUI();
        this.closeAllModals();
        this.showToast('Settings saved', 'success');

        if (this.settings.desktopNotifications && 'Notification' in window) {
          Notification.requestPermission();
        }
      } else {
        this.showToast(response.error || 'Failed to save settings', 'error');
      }
    } catch (error) {
      console.error('Save settings error:', error);
      this.showToast('Settings saved locally', 'warning');
      this.closeAllModals();
    }
  }

  switchSettingsTab(tab) {
    document.querySelectorAll('.settings-tabs .tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
      btn.setAttribute('aria-selected', btn.dataset.tab === tab);
    });

    document.querySelectorAll('.settings-tab').forEach(tabEl => {
      tabEl.classList.toggle('active', tabEl.id === `${tab}-tab`);
    });
  }

  // ============================================
  // THEME (15 THEMES)
  // ============================================
  initTheme() {
    const saved = localStorage.getItem('chatTheme') || 'dark';
    this.setTheme(saved);
  }

  toggleTheme() {
    const current = document.documentElement.dataset.theme;
    const currentIndex = CONFIG.THEMES.indexOf(current);
    const nextIndex = (currentIndex + 1) % CONFIG.THEMES.length;
    this.setTheme(CONFIG.THEMES[nextIndex]);
    this.showToast(`Theme: ${CONFIG.THEMES[nextIndex]}`, 'info');
  }

  setTheme(theme) {
    if (!CONFIG.THEMES.includes(theme)) {
      theme = 'dark';
    }
    
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('chatTheme', theme);

    const icon = this.headerElements.themeToggle?.querySelector('i');
    if (icon) {
      const icons = {
        dark: 'fa-moon',
        light: 'fa-sun',
        midnight: 'fa-star',
        nature: 'fa-leaf',
        sunset: 'fa-cloud-sun',
        ocean: 'fa-water',
        forest: 'fa-tree',
        cherry: 'fa-heart',
        cyberpunk: 'fa-robot',
        lavender: 'fa-spa',
        mocha: 'fa-coffee',
        arctic: 'fa-snowflake',
        volcano: 'fa-fire',
        galaxy: 'fa-meteor',
        retro: 'fa-gamepad'
      };
      icon.className = `fas ${icons[theme] || 'fa-moon'}`;
    }

    if (this.settingsModalElements.themeSelect) {
      this.settingsModalElements.themeSelect.value = theme;
    }
  }

  // ============================================
  // EMOJI PICKER
  // ============================================
  initEmojiData() {
    return {
      smileys: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '💀', '👻', '👽', '🤖', '💩', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'],
      people: ['👋', '🤚', '🖐', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', '👁', '👅', '👄', '👶', '🧒', '👦', '👧', '🧑', '👱', '👨', '🧔', '👩', '🧓', '👴', '👵'],
      animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐻‍❄️', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🪲', '🐛', '🦋', '🐌', '🐞', '🐜', '🪰', '🪱', '🦟', '🦗', '🕷', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🦣', '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🦬', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐕‍🦺', '🐈', '🐈‍⬛', '🪶', '🐓', '🦃', '🦤', '🦚', '🦜', '🦢', '🦩', '🕊', '🐇', '🦝', '🦨', '🦡', '🦫', '🦦', '🦥', '🐁', '🐀', '🐿', '🦔'],
      food: ['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶', '🫑', '🌽', '🥕', '🫒', '🧄', '🧅', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🌭', '🍔', '🍟', '🍕', '🫓', '🥪', '🥙', '🧆', '🌮', '🌯', '🫔', '🥗', '🥘', '🫕', '🥫', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🦪', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢', '🍡', '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '🌰', '🥜', '🍯', '🥛', '🍼', '🫖', '☕', '🍵', '🧃', '🥤', '🧋', '🍶', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧉', '🍾', '🧊'],
      activities: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷', '⛸', '🥌', '🎿', '⛷', '🏂', '🪂', '🏋️', '🤼', '🤸', '🤺', '⛹️', '🤾', '🏌️', '🏇', '🧘', '🏄', '🏊', '🤽', '🚣', '🧗', '🚵', '🚴', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖', '🏵', '🎗', '🎫', '🎟', '🎪', '🤹', '🎭', '🩰', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🪘', '🎷', '🎺', '🪗', '🎸', '🪕', '🎻', '🎲', '♟', '🎯', '🎳', '🎮', '🎰', '🧩'],
      travel: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🦯', '🦽', '🦼', '🛴', '🚲', '🛵', '🏍', '🛺', '🚨', '🚔', '🚍', '🚘', '🚖', '🚡', '🚠', '🚟', '🚃', '🚋', '🚞', '🚝', '🚄', '🚅', '🚈', '🚂', '🚆', '🚇', '🚊', '🚉', '✈️', '🛫', '🛬', '🛩', '💺', '🛰', '🚀', '🛸', '🚁', '🛶', '⛵', '🚤', '🛥', '🛳', '⛴', '🚢', '⚓', '🪝', '⛽', '🚧', '🚦', '🚥', '🚏', '🗺', '🗿', '🗽', '🗼', '🏰', '🏯', '🏟', '🎡', '🎢', '🎠', '⛲', '⛱', '🏖', '🏝', '🏜', '🌋', '⛰', '🏔', '🗻', '🏕', '⛺', '🏠', '🏡', '🏘', '🏚', '🏗', '🏭', '🏢', '🏬', '🏣', '🏤', '🏥', '🏦', '🏨', '🏪', '🏫', '🏩', '💒', '🏛', '⛪', '🕌', '🕍', '🛕', '🕋', '⛩', '🛤', '🛣', '🗾', '🎑', '🏞', '🌅', '🌄', '🌠', '🎇', '🎆', '🌇', '🌆', '🏙', '🌃', '🌌', '🌉', '🌁'],
      objects: ['⌚', '📱', '📲', '💻', '⌨️', '🖥', '🖨', '🖱', '🖲', '🕹', '🗜', '💽', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽', '🎞', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙', '🎚', '🎛', '🧭', '⏱', '⏲', '⏰', '🕰', '⌛', '⏳', '📡', '🔋', '🔌', '💡', '🔦', '🕯', '🪔', '🧯', '🛢', '💸', '💵', '💴', '💶', '💷', '🪙', '💰', '💳', '💎', '⚖️', '🪜', '🧰', '🪛', '🔧', '🔨', '⚒', '🛠', '⛏', '🪚', '🔩', '⚙️', '🪤', '🧱', '⛓', '🧲', '🔫', '💣', '🧨', '🪓', '🔪', '🗡', '⚔️', '🛡', '🚬', '⚰️', '🪦', '⚱️', '🏺', '🔮', '📿', '🧿', '💈', '⚗️', '🔭', '🔬', '🕳', '🩹', '🩺', '💊', '💉', '🩸', '🧬', '🦠', '🧫', '🧪', '🌡', '🧹', '🪠', '🧺', '🧻', '🚽', '🚰', '🚿', '🛁', '🛀', '🧼', '🪥', '🪒', '🧽', '🪣', '🧴', '🛎', '🔑', '🗝', '🚪', '🪑', '🛋', '🛏', '🛌', '🧸', '🪆', '🖼', '🪞', '🪟', '🛍', '🛒', '🎁', '🎈', '🎏', '🎀', '🪄', '🪅', '🎊', '🎉', '🎎', '🏮', '🎐', '🧧', '✉️', '📩', '📨', '📧', '💌', '📥', '📤', '📦', '🏷', '🪧', '📪', '📫', '📬', '📭', '📮', '📯', '📜', '📃', '📄', '📑', '🧾', '📊', '📈', '📉', '🗒', '🗓', '📆', '📅', '🗑', '📇', '🗃', '🗳', '🗄', '📋', '📁', '📂', '🗂', '🗞', '📰', '📓', '📔', '📒', '📕', '📗', '📘', '📙', '📚', '📖', '🔖', '🧷', '🔗', '📎', '🖇', '📐', '📏', '🧮', '📌', '📍', '✂️', '🖊', '🖋', '✒️', '🖌', '🖍', '📝', '✏️', '🔍', '🔎', '🔏', '🔐', '🔒', '🔓'],
      symbols: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗', '❕', '❓', '❔', '‼️', '⁉️', '🔅', '🔆', '〽️', '⚠️', '🚸', '🔱', '⚜️', '🔰', '♻️', '✅', '🈯', '💹', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️', '🌀', '💤', '🏧', '🚾', '♿', '🅿️', '🛗', '🈳', '🈂️', '🛂', '🛃', '🛄', '🛅', '🚹', '🚺', '🚼', '⚧', '🚻', '🚮', '🎦', '📶', '🈁', '🔣', 'ℹ️', '🔤', '🔡', '🔠', '🆖', '🆗', '🆙', '🆒', '🆕', '🆓', '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '🔢', '#️⃣', '*️⃣', '⏏️', '▶️', '⏸', '⏯', '⏹', '⏺', '⏭', '⏮', '⏩', '⏪', '⏫', '⏬', '◀️', '🔼', '🔽', '➡️', '⬅️', '⬆️', '⬇️', '↗️', '↘️', '↙️', '↖️', '↕️', '↔️', '↪️', '↩️', '⤴️', '⤵️', '🔀', '🔁', '🔂', '🔄', '🔃', '🎵', '🎶', '➕', '➖', '➗', '✖️', '🟰', '♾', '💲', '💱', '™️', '©️', '®️', '〰️', '➰', '➿', '🔚', '🔙', '🔛', '🔝', '🔜', '✔️', '☑️', '🔘', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '🔺', '🔻', '🔸', '🔹', '🔶', '🔷', '🔳', '🔲', '▪️', '▫️', '◾', '◽', '◼️', '◻️', '🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '⬛', '⬜', '🟫', '🔈', '🔇', '🔉', '🔊', '🔔', '🔕', '📣', '📢', '👁‍🗨', '💬', '💭', '🗯', '♠️', '♣️', '♥️', '♦️', '🃏', '🎴', '🀄', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛', '🕜', '🕝', '🕞', '🕟', '🕠', '🕡', '🕢', '🕣', '🕤', '🕥', '🕦', '🕧'],
      flags: ['🏳️', '🏴', '🏴‍☠️', '🏁', '🚩', '🎌', '🏳️‍🌈', '🏳️‍⚧️', '🇺🇳', '🇦🇫', '🇦🇱', '🇩🇿', '🇦🇸', '🇦🇩', '🇦🇴', '🇦🇮', '🇦🇶', '🇦🇬', '🇦🇷', '🇦🇲', '🇦🇼', '🇦🇺', '🇦🇹', '🇦🇿', '🇧🇸', '🇧🇭', '🇧🇩', '🇧🇧', '🇧🇾', '🇧🇪', '🇧🇿', '🇧🇯', '🇧🇲', '🇧🇹', '🇧🇴', '🇧🇦', '🇧🇼', '🇧🇷', '🇮🇴', '🇻🇬', '🇧🇳', '🇧🇬', '🇧🇫', '🇧🇮', '🇰🇭', '🇨🇲', '🇨🇦', '🇮🇨', '🇨🇻', '🇧🇶', '🇰🇾', '🇨🇫', '🇹🇩', '🇨🇱', '🇨🇳', '🇨🇽', '🇨🇨', '🇨🇴', '🇰🇲', '🇨🇬', '🇨🇩', '🇨🇰', '🇨🇷', '🇨🇮', '🇭🇷', '🇨🇺', '🇨🇼', '🇨🇾', '🇨🇿', '🇩🇰', '🇩🇯', '🇩🇲', '🇩🇴', '🇪🇨', '🇪🇬', '🇸🇻', '🇬🇶', '🇪🇷', '🇪🇪', '🇸🇿', '🇪🇹', '🇪🇺', '🇫🇰', '🇫🇴', '🇫🇯', '🇫🇮', '🇫🇷', '🇬🇫', '🇵🇫', '🇹🇫', '🇬🇦', '🇬🇲', '🇬🇪', '🇩🇪', '🇬🇭', '🇬🇮', '🇬🇷', '🇬🇱', '🇬🇩', '🇬🇵', '🇬🇺', '🇬🇹', '🇬🇬', '🇬🇳', '🇬🇼', '🇬🇾', '🇭🇹', '🇭🇳', '🇭🇰', '🇭🇺', '🇮🇸', '🇮🇳', '🇮🇩', '🇮🇷', '🇮🇶', '🇮🇪', '🇮🇲', '🇮🇱', '🇮🇹', '🇯🇲', '🇯🇵', '🎌', '🇯🇪', '🇯🇴', '🇰🇿', '🇰🇪', '🇰🇮', '🇽🇰', '🇰🇼', '🇰🇬', '🇱🇦', '🇱🇻', '🇱🇧', '🇱🇸', '🇱🇷', '🇱🇾', '🇱🇮', '🇱🇹', '🇱🇺', '🇲🇴', '🇲🇬', '🇲🇼', '🇲🇾', '🇲🇻', '🇲🇱', '🇲🇹', '🇲🇭', '🇲🇶', '🇲🇷', '🇲🇺', '🇾🇹', '🇲🇽', '🇫🇲', '🇲🇩', '🇲🇨', '🇲🇳', '🇲🇪', '🇲🇸', '🇲🇦', '🇲🇿', '🇲🇲', '🇳🇦', '🇳🇷', '🇳🇵', '🇳🇱', '🇳🇨', '🇳🇿', '🇳🇮', '🇳🇪', '🇳🇬', '🇳🇺', '🇳🇫', '🇰🇵', '🇲🇰', '🇲🇵', '🇳🇴', '🇴🇲', '🇵🇰', '🇵🇼', '🇵🇸', '🇵🇦', '🇵🇬', '🇵🇾', '🇵🇪', '🇵🇭', '🇵🇳', '🇵🇱', '🇵🇹', '🇵🇷', '🇶🇦', '🇷🇪', '🇷🇴', '🇷🇺', '🇷🇼', '🇼🇸', '🇸🇲', '🇸🇹', '🇸🇦', '🇸🇳', '🇷🇸', '🇸🇨', '🇸🇱', '🇸🇬', '🇸🇽', '🇸🇰', '🇸🇮', '🇬🇸', '🇸🇧', '🇸🇴', '🇿🇦', '🇰🇷', '🇸🇸', '🇪🇸', '🇱🇰', '🇧🇱', '🇸🇭', '🇰🇳', '🇱🇨', '🇵🇲', '🇻🇨', '🇸🇩', '🇸🇷', '🇸🇪', '🇨🇭', '🇸🇾', '🇹🇼', '🇹🇯', '🇹🇿', '🇹🇭', '🇹🇱', '🇹🇬', '🇹🇰', '🇹🇴', '🇹🇹', '🇹🇳', '🇹🇷', '🇹🇲', '🇹🇨', '🇹🇻', '🇻🇮', '🇺🇬', '🇺🇦', '🇦🇪', '🇬🇧', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', '🏴󠁧󠁢󠁷󠁬󠁳󠁿', '🇺🇸', '🇺🇾', '🇺🇿', '🇻🇺', '🇻🇦', '🇻🇪', '🇻🇳', '🇼🇫', '🇪🇭', '🇾🇪', '🇿🇲', '🇿🇼']
    };
  }

  initEmojis() {
    this.loadEmojiCategory('smileys');
  }

  loadEmojiCategory(category) {
    const emojis = this.emojiCategories[category] || [];
    const grid = this.chatElements.emojiGrid;
    if (!grid) return;

    grid.innerHTML = emojis.map(emoji =>
      `<button class="emoji-btn" type="button" onclick="app.insertEmoji('${emoji}')">${emoji}</button>`
    ).join('');
  }

  searchEmojis(query) {
    if (!query) {
      this.loadEmojiCategory('smileys');
      return;
    }

    const allEmojis = Object.values(this.emojiCategories).flat();
    const grid = this.chatElements.emojiGrid;
    if (!grid) return;

    grid.innerHTML = allEmojis.slice(0, 100).map(emoji =>
      `<button class="emoji-btn" type="button" onclick="app.insertEmoji('${emoji}')">${emoji}</button>`
    ).join('');
  }

  insertEmoji(emoji) {
    // Check if we're inserting for a message reaction
    if (this.emojiPickerTargetMessage) {
      this.toggleReaction(this.emojiPickerTargetMessage, emoji);
      this.emojiPickerTargetMessage = null;
      this.chatElements.emojiPicker?.classList.remove('active');
      return;
    }

    const input = this.chatElements.messageInput;
    if (!input) return;

    const start = input.selectionStart;
    const end = input.selectionEnd;
    const text = input.value;

    input.value = text.substring(0, start) + emoji + text.substring(end);
    input.focus();
    input.selectionStart = input.selectionEnd = start + emoji.length;

    this.chatElements.emojiPicker?.classList.remove('active');
  }

  // ============================================
  // NOTIFICATIONS
  // ============================================
  playSound(type = 'notification') {
    if (!this.settings.soundEnabled) return;

    try {
      const sound = this.sounds[type] || this.sounds.notification;
      if (sound) {
        sound.currentTime = 0;
        sound.volume = 0.5;
        sound.play().catch(() => {});
      }
    } catch (e) {
      console.error('Error playing sound:', e);
    }
  }

  showDesktopNotification(message) {
    if (!this.settings.desktopNotifications) return;
    if (document.hasFocus()) return;
    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      const notification = new Notification(message.displayName || message.username, {
        body: this.truncateText(message.text, 100),
        icon: message.avatar || '/favicon.ico',
        tag: message.id,
        badge: '/favicon.ico'
      });

      notification.onclick = () => {
        window.focus();
        this.scrollToMessage(message.id);
        notification.close();
      };

      setTimeout(() => notification.close(), 5000);
    }
  }

  // ============================================
  // UI HELPERS
  // ============================================
  showScreen(screen) {
    Object.values(this.screens).forEach(s => s?.classList.remove('active'));
    this.screens[screen]?.classList.add('active');
  }

  updateUI() {
    if (!this.user) return;

    const avatar = this.user.avatar || this.avatarService.generateDefault(this.user.username);

    if (this.userProfileElements.avatar) {
      this.userProfileElements.avatar.src = avatar;
    }
    if (this.userProfileElements.displayName) {
      this.userProfileElements.displayName.textContent = this.user.displayName || this.user.username;
    }
    if (this.userProfileElements.username) {
      this.userProfileElements.username.textContent = `@${this.user.username}`;
    }
    if (this.userProfileElements.roleBadge) {
      this.userProfileElements.roleBadge.innerHTML = this.getRoleBadgeHtml(this.user.role);
    }

    if (this.settingsModalElements.avatar) {
      this.settingsModalElements.avatar.src = avatar;
    }
    if (this.settingsModalElements.displayName) {
      this.settingsModalElements.displayName.value = this.user.displayName || '';
    }
    if (this.settingsModalElements.bio) {
      this.settingsModalElements.bio.value = this.user.bio || '';
    }
    if (this.settingsModalElements.username) {
      this.settingsModalElements.username.value = this.user.username;
    }
    if (this.settingsModalElements.email) {
      this.settingsModalElements.email.value = this.user.email;
    }
    if (this.settingsModalElements.userId) {
      this.settingsModalElements.userId.value = this.user.id;
    }

    this.updateRoomsList();
    this.updateUsersList();
    this.updateAdminButtonVisibility();
  }

  openModal(modal) {
    this.modals[modal]?.classList.add('active');
    // Focus first input
    setTimeout(() => {
      this.modals[modal]?.querySelector('input, textarea, select')?.focus();
    }, 100);
  }

  closeAllModals() {
    Object.values(this.modals).forEach(m => m?.classList.remove('active'));
  }

  showConfirmModal(title, message, onConfirm, confirmText = 'Confirm', type = 'primary', hasHtml = false) {
    const modal = this.modals.confirm;
    if (!modal) return;

    const titleEl = this.confirmModalElements.title;
    const messageEl = this.confirmModalElements.message;
    const confirmBtn = this.confirmModalElements.confirmBtn;

    if (titleEl) titleEl.textContent = title;
    if (messageEl) {
      if (hasHtml) {
        messageEl.innerHTML = message;
      } else {
        messageEl.textContent = message;
      }
    }
    if (confirmBtn) {
      confirmBtn.textContent = confirmText;
      confirmBtn.className = `btn btn-${type}`;
      confirmBtn.onclick = async () => {
        confirmBtn.disabled = true;
        try {
          await onConfirm();
        } finally {
          confirmBtn.disabled = false;
          this.closeAllModals();
        }
      };
    }

    this.openModal('confirm');
  }

  openImageModal(url) {
    const modal = this.modals.image;
    if (!modal) return;

    const img = modal.querySelector('.modal-image');
    const downloadLink = modal.querySelector('#image-download');
    const openLink = modal.querySelector('#image-open');

    if (img) img.src = url;
    if (downloadLink) downloadLink.href = url;
    if (openLink) openLink.href = url;

    this.openModal('image');
  }

  showShortcutsModal() {
    this.openModal('shortcuts');
  }

  showToast(message, type = 'info') {
    const container = this.toastContainer;
    if (!container) {
      console.log(`Toast [${type}]:`, message);
      return;
    }

    const icons = {
      success: 'fa-check-circle',
      error: 'fa-exclamation-circle',
      warning: 'fa-exclamation-triangle',
      info: 'fa-info-circle'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <i class="fas ${icons[type] || icons.info}"></i>
      <span>${this.escapeHtml(message)}</span>
      <button class="toast-close" onclick="this.parentElement.remove()">
        <i class="fas fa-times"></i>
      </button>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  setButtonLoading(button, loading, text) {
    if (!button) return;

    if (loading) {
      button.disabled = true;
      button.dataset.originalText = button.innerHTML;
      button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${text}`;
    } else {
      button.disabled = false;
      button.innerHTML = button.dataset.originalText || `<span>${text}</span>`;
    }
  }

  scrollToBottom() {
    const container = this.chatElements.messagesContainer;
    if (container) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
  }

  autoResizeTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
  }

  // ============================================
  // API REQUEST
  // ============================================
  async apiRequest(url, options = {}) {
    if (!navigator.onLine) {
      console.log('[API] Offline - request blocked:', url);
      return { error: 'You are offline', offline: true };
    }

    try {
      const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      };

      const fetchOptions = {
        method: options.method || 'GET',
        headers
      };

      if (options.body) {
        fetchOptions.body = options.body;
      }

      const response = await fetch(url, fetchOptions);
      
      let data;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        console.error('[API] Non-JSON response:', text);
        data = { error: 'Invalid response from server' };
      }

      if (!response.ok) {
        console.error(`[API] Error ${response.status}:`, data);
      }

      return data;

    } catch (error) {
      console.error('[API] Request failed:', url, error);
      return { error: 'Network request failed: ' + error.message };
    }
  }

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  formatTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000 && date.getDate() === now.getDate()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (diff < 172800000) return 'Yesterday';
    if (diff < 604800000) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  formatDateFull(dateString) {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    const now = new Date();

    if (date.toDateString() === now.toDateString()) return 'Today';

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

    return date.toLocaleDateString([], { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric', 
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined 
    });
  }

  formatFileSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(1) + ' GB';
  }

  generateDefaultAvatar(username) {
    return this.avatarService.generateDefault(username);
  }

  debounce(func, wait) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }
}

// ============================================
// THEME CSS VARIABLES (Add to your CSS file)
// ============================================
/*
[data-theme="dark"] { --bg-primary: #1a1a2e; --bg-secondary: #16213e; --text-primary: #eee; --accent: #e94560; }
[data-theme="light"] { --bg-primary: #f5f5f5; --bg-secondary: #fff; --text-primary: #333; --accent: #6366f1; }
[data-theme="midnight"] { --bg-primary: #0f0f23; --bg-secondary: #1a1a3e; --text-primary: #c9c9ff; --accent: #7c3aed; }
[data-theme="nature"] { --bg-primary: #1a2f1a; --bg-secondary: #0d1f0d; --text-primary: #c8e6c9; --accent: #4caf50; }
[data-theme="sunset"] { --bg-primary: #2d1b2d; --bg-secondary: #1a0f1a; --text-primary: #ffd6e0; --accent: #ff6b6b; }
[data-theme="ocean"] { --bg-primary: #0a192f; --bg-secondary: #112240; --text-primary: #8892b0; --accent: #64ffda; }
[data-theme="forest"] { --bg-primary: #1b2d1b; --bg-secondary: #0f1f0f; --text-primary: #a8d5a2; --accent: #8bc34a; }
[data-theme="cherry"] { --bg-primary: #2d1f2d; --bg-secondary: #1f141f; --text-primary: #f8bbd9; --accent: #e91e63; }
[data-theme="cyberpunk"] { --bg-primary: #0d0d0d; --bg-secondary: #1a1a1a; --text-primary: #00ff9f; --accent: #ff00ff; }
[data-theme="lavender"] { --bg-primary: #2d2d3f; --bg-secondary: #1f1f2e; --text-primary: #e0d6ff; --accent: #b388ff; }
[data-theme="mocha"] { --bg-primary: #1e1e2e; --bg-secondary: #181825; --text-primary: #cdd6f4; --accent: #f5c2e7; }
[data-theme="arctic"] { --bg-primary: #e8f4f8; --bg-secondary: #fff; --text-primary: #2c3e50; --accent: #00bcd4; }
[data-theme="volcano"] { --bg-primary: #1a0a0a; --bg-secondary: #2d1515; --text-primary: #ffccbc; --accent: #ff5722; }
[data-theme="galaxy"] { --bg-primary: #0a0a1a; --bg-secondary: #15152d; --text-primary: #e0e0ff; --accent: #9c27b0; }
[data-theme="retro"] { --bg-primary: #2b2b2b; --bg-secondary: #1f1f1f; --text-primary: #f0e68c; --accent: #ff6347; }

.message.aligned-right { flex-direction: row-reverse; }
.message.aligned-right .message-content { align-items: flex-end; }
.message.aligned-right .message-text { text-align: right; }
*/

// ============================================
// INITIALIZE APPLICATION
// ============================================
const app = new ChatApp();
window.app = app;

console.log('🚀 ChatHub Enhanced initialized with:');
console.log('   ✅ 15 Themes');
console.log('   ✅ Multiple Avatar Formats (JPG, PNG, GIF, WebP, SVG)');
console.log('   ✅ Right-aligned Sender Messages');
console.log('   ✅ Channel Admin Features');
console.log('   ✅ Master Control Panel');
console.log('   ✅ Offline Support & Message Queuing');
console.log('   ✅ Polling Fallback');
// ============================================
// SERVICE WORKER REGISTRATION
// ============================================

class ServiceWorkerManager {
  constructor() {
    this.registration = null;
    this.updateAvailable = false;
  }

  async register() {
    if (!('serviceWorker' in navigator)) {
      console.log('Service Worker not supported');
      return false;
    }

    try {
      this.registration = await navigator.serviceWorker.register('/service-worker.js', {
        scope: '/'
      });

      console.log('✅ Service Worker registered:', this.registration.scope);

      // Check for updates
      this.registration.addEventListener('updatefound', () => {
        const newWorker = this.registration.installing;
        console.log('🔄 Service Worker update found');

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            this.updateAvailable = true;
            this.showUpdateNotification();
          }
        });
      });

      // Listen for controller change
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('🔄 Service Worker controller changed');
        window.location.reload();
      });

      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        this.handleServiceWorkerMessage(event.data);
      });

      // Check for updates every hour
      setInterval(() => {
        this.registration.update();
      }, 60 * 60 * 1000);

      return true;

    } catch (error) {
      console.error('❌ Service Worker registration failed:', error);
      return false;
    }
  }

  async unregister() {
    if (this.registration) {
      const success = await this.registration.unregister();
      console.log('Service Worker unregistered:', success);
      return success;
    }
    return false;
  }

  async update() {
    if (this.registration) {
      await this.registration.update();
      console.log('Service Worker update check triggered');
    }
  }

  skipWaiting() {
    if (this.registration && this.registration.waiting) {
      this.registration.waiting.postMessage({ type: 'skipWaiting' });
    }
  }

  showUpdateNotification() {
    // Show update notification UI
    const notification = document.createElement('div');
    notification.className = 'update-notification';
    notification.innerHTML = `
      <div class="update-content">
        <i class="fas fa-sync-alt"></i>
        <span>A new version is available!</span>
        <button class="btn-update" onclick="swManager.skipWaiting()">Update Now</button>
        <button class="btn-dismiss" onclick="this.closest('.update-notification').remove()">Later</button>
      </div>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 100);
  }

  handleServiceWorkerMessage(data) {
    console.log('Message from Service Worker:', data);

    if (data.type === 'sync-complete') {
      console.log(`Synced ${data.count} messages`);
      if (window.app) {
        window.app.showToast(`${data.count} messages synced`, 'success');
      }
    }
  }

  async getCacheSize() {
    if (!this.registration || !this.registration.active) {
      return 0;
    }

    return new Promise((resolve) => {
      const messageChannel = new MessageChannel();
      
      messageChannel.port1.onmessage = (event) => {
        resolve(event.data.cacheSize);
      };

      this.registration.active.postMessage(
        { type: 'getCacheSize' },
        [messageChannel.port2]
      );
    });
  }

  async clearCache() {
    if (this.registration && this.registration.active) {
      this.registration.active.postMessage({ type: 'clearCache' });
      console.log('Cache clear requested');
    }
  }
}

// Initialize Service Worker Manager
const swManager = new ServiceWorkerManager();

// Register on load
window.addEventListener('load', async () => {
  const registered = await swManager.register();
  
  if (registered) {
    console.log('✅ PWA ready');
    
    // Show install prompt
    showInstallPrompt();
  }
});

// ============================================
// INSTALL PROMPT
// ============================================

let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  console.log('💾 Install prompt available');
  e.preventDefault();
  deferredPrompt = e;
  
  // Show install button
  showInstallButton();
});

function showInstallButton() {
  const installBtn = document.getElementById('install-app-btn');
  if (installBtn) {
    installBtn.style.display = 'flex';
    installBtn.addEventListener('click', installApp);
  }
}

async function installApp() {
  if (!deferredPrompt) {
    console.log('No install prompt available');
    return;
  }

  deferredPrompt.prompt();
  
  const { outcome } = await deferredPrompt.userChoice;
  console.log(`Install prompt outcome: ${outcome}`);

  if (outcome === 'accepted') {
    console.log('✅ App installed');
    if (window.app) {
      window.app.showToast('ChatHub installed successfully!', 'success');
    }
  }

  deferredPrompt = null;
  
  const installBtn = document.getElementById('install-app-btn');
  if (installBtn) {
    installBtn.style.display = 'none';
  }
}

window.addEventListener('appinstalled', () => {
  console.log('✅ App was installed');
  deferredPrompt = null;
});

function showInstallPrompt() {
  // Only show if not already installed
  if (window.matchMedia('(display-mode: standalone)').matches) {
    console.log('App already installed');
    return;
  }

  // Check if iOS
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  
  if (isIOS && !window.navigator.standalone) {
    // Show iOS install instructions
    showIOSInstallInstructions();
  }
}

function showIOSInstallInstructions() {
  const modal = document.createElement('div');
  modal.className = 'ios-install-modal';
  modal.innerHTML = `
    <div class="ios-install-content">
      <h3>Install ChatHub</h3>
      <p>To install this app on your iPhone:</p>
      <ol>
        <li>Tap the <strong>Share</strong> button <i class="fas fa-share"></i></li>
        <li>Scroll down and tap <strong>Add to Home Screen</strong> <i class="fas fa-plus-square"></i></li>
        <li>Tap <strong>Add</strong> in the top right corner</li>
      </ol>
      <button class="btn-primary" onclick="this.closest('.ios-install-modal').remove()">Got it!</button>
    </div>
  `;
  document.body.appendChild(modal);
  
  setTimeout(() => modal.classList.add('show'), 100);
}

// ============================================
// OFFLINE/ONLINE DETECTION
// ============================================

window.addEventListener('online', () => {
  console.log('🌐 Back online');
  document.body.classList.remove('offline-mode');
  
  if (window.app) {
    window.app.updateConnectionStatus('connecting');
    window.app.connectWebSocket();
    window.app.pollingService.syncOfflineMessages();
  }
});

window.addEventListener('offline', () => {
  console.log('📡 Gone offline');
  document.body.classList.add('offline-mode');
  
  if (window.app) {
    window.app.updateConnectionStatus('offline');
  }
});

// Check initial state
if (!navigator.onLine) {
  document.body.classList.add('offline-mode');
}