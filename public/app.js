// ============================================
// CHATHUB - REAL-TIME CHAT APPLICATION
// Complete Client-Side Application with Polling Support
// ============================================

// ============================================
// POLLING SERVICE - Syncs messages when WebSocket is down
// ============================================
class PollingService {
  constructor(app) {
    this.app = app;
    this.pollInterval = null;
    this.pollIntervalMs = 1000; // Poll every 5 seconds
    this.isPolling = false;
    this.lastRoomMessageId = null;
    this.lastDMCheck = 0;
    this.enabled = false;
    this.consecutiveErrors = 0;
    this.maxConsecutiveErrors = 5;
  }

  start() {
    if (this.pollInterval) return;
    
    this.enabled = true;
    this.consecutiveErrors = 0;
    console.log('[Polling] Starting polling service (interval: ' + this.pollIntervalMs + 'ms)');
    
    this.pollInterval = setInterval(() => {
      this.poll();
    }, this.pollIntervalMs);

    // Initial poll after a short delay
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
    // Don't poll if WebSocket is connected and working
    if (this.app.ws && this.app.ws.readyState === WebSocket.OPEN) {
      return;
    }

    // Don't poll if already polling or no token
    if (this.isPolling || !this.app.token) return;

    // Don't poll if too many consecutive errors
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

      // Reset error count on success
      this.consecutiveErrors = 0;

      // Process new room messages
      if (response.roomMessages && response.roomMessages.length > 0) {
        console.log(`[Polling] Got ${response.roomMessages.length} new room messages`);
        
        for (const message of response.roomMessages) {
          this.app.handleNewMessage(message);
        }
      }

      // Update last message ID
      if (response.lastRoomMessageId) {
        this.lastRoomMessageId = response.lastRoomMessageId;
      }

      // Process new DM messages
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

      // Update timestamp for next DM check
      this.lastDMCheck = response.timestamp || Date.now();

      // Update online users
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

  // Call this when user joins a room
  setRoom(roomId, lastMessageId = null) {
    this.lastRoomMessageId = lastMessageId;
    console.log(`[Polling] Room set to ${roomId}, lastMessageId: ${lastMessageId}`);
  }

  // Reset for new session
  reset() {
    this.lastRoomMessageId = null;
    this.lastDMCheck = 0;
    this.consecutiveErrors = 0;
  }

  // Adjust polling interval
  setInterval(ms) {
    this.pollIntervalMs = ms;
    if (this.pollInterval) {
      this.stop();
      this.start();
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
    // Polling service
    this.pollingService = new PollingService(this);

    // WebSocket & Authentication
    this.ws = null;
    this.user = null;
    this.token = null;
    this.connectionId = null;
    
    // Reconnection
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000;
    this.pingInterval = null;
    this.isConnecting = false;
    
    // Room & Messages
    this.currentRoom = 'general';
    this.rooms = [];
    this.messages = new Map();
    this.onlineUsers = new Map();
    this.renderedMessageIds = new Set(); // For deduplication
    
    // Typing
    this.typingUsers = new Map();
    this.typingTimeout = null;
    this.isTyping = false;
    
    // UI State
    this.replyingTo = null;
    this.attachment = null;
    this.lastMessageDate = null;
    this.emojiCategories = this.initEmojiData();
    
    // Sidebar
    this.sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    this.sidebarOpen = false;
    
    // Direct Messages
    this.directMessages = new Map();
    this.currentDM = null;
    this.dmConversations = [];
    this.renderedDMIds = new Set(); // For DM deduplication
    
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
    
    // Settings
    this.settings = {
      soundEnabled: true,
      desktopNotifications: false,
      compactMode: false,
      showTimestamps: true
    };
    
    // Initialize
    this.init();
  }

  init() {
    console.log('🚀 Initializing ChatHub with Polling Support...');
    this.cacheElements();
    this.attachEventListeners();
    this.initTheme();
    this.initEmojis();
    this.initSidebar();
    this.loadSettings();
    this.checkExistingSession();
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
      createRoomBtn: document.getElementById('create-room-btn')
    };

    // User Profile Elements
    this.userProfileElements = {
      avatar: document.getElementById('user-avatar'),
      displayName: document.getElementById('user-displayname'),
      username: document.getElementById('user-username'),
      statusBtn: document.getElementById('status-btn'),
      statusDropdown: document.getElementById('status-dropdown'),
      settingsBtn: document.getElementById('settings-btn')
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
      connectionStatus: document.getElementById('connection-status')
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

    // Modal Elements
    this.modals = {
      settings: document.getElementById('settings-modal'),
      createRoom: document.getElementById('create-room-modal'),
      newDM: document.getElementById('new-dm-modal'),
      userProfile: document.getElementById('user-profile-modal'),
      image: document.getElementById('image-modal'),
      confirm: document.getElementById('confirm-modal')
    };

    // Settings Modal Elements
    this.settingsModalElements = {
      avatar: document.getElementById('settings-avatar'),
      avatarInput: document.getElementById('avatar-input'),
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

    // Context Menu
    this.contextMenu = document.getElementById('context-menu');

    // Toast Container
    this.toastContainer = document.getElementById('toast-container');

    // Audio Elements
    this.sounds = {
      notification: document.getElementById('notification-sound'),
      mention: document.getElementById('mention-sound')
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
      if (e.key === 'Enter' && !e.shiftKey) {
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

      // Send message on Enter
      if (e.key === 'Enter' && !e.shiftKey) {
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
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendThreadReply();
      }
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

    this.settingsModalElements.avatarInput?.addEventListener('change', (e) => {
      this.uploadAvatar(e);
    });

    this.settingsModalElements.bio?.addEventListener('input', (e) => {
      const count = e.target.value.length;
      if (this.settingsModalElements.bioCharCount) {
        this.settingsModalElements.bioCharCount.textContent = count;
      }
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
      }
    });

    // Handle window resize
    window.addEventListener('resize', this.debounce(() => {
      this.handleResize();
    }, 100));

    // Handle visibility change (for reconnection)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.user) {
        // Try to reconnect WebSocket if not connected
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          this.connectWebSocket();
        }
        // Also do a poll to catch up
        this.pollingService.poll();
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
      this.showToast('You are offline', 'warning');
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
      offline: 'Offline'
    };
    
    indicator.title = titles[status] || 'Unknown';
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

    try {
      const response = await this.apiRequest('/api/auth/verify', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.success) {
        this.token = token;
        this.user = response.user;
        this.connectWebSocket();
      } else {
        this.clearSession();
        this.showScreen('auth');
      }
    } catch (error) {
      console.error('Session verification failed:', error);
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

        this.connectWebSocket();
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
    if (!strengthBar) return;

    let strength = 0;
    if (password.length >= 6) strength++;
    if (password.length >= 10) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    const percentage = (strength / 5) * 100;
    strengthBar.style.width = `${percentage}%`;

    strengthBar.className = 'strength-bar';
    if (strength <= 2) strengthBar.classList.add('weak');
    else if (strength <= 3) strengthBar.classList.add('medium');
    else strengthBar.classList.add('strong');
  }

  async logout() {
    try {
      await this.apiRequest('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
    } catch (error) {
      console.error('Logout error:', error);
    }

    this.pollingService.stop();
    this.pollingService.reset();
    this.clearSession();
    this.closeAllModals();
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
      
      // Stop polling when WS is connected
      this.pollingService.stop();
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
    
    // If we're already showing chat, do an immediate poll
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
    }, 30000);
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

      case 'pong':
        // Keep-alive response
        break;

      case 'error':
        this.showToast(data.message || 'An error occurred', 'error');
        break;

      default:
        console.log('Unknown message type:', data.type);
    }
  }

  // ============================================
  // ROOM MANAGEMENT
  // ============================================
  joinRoom(roomId) {
    // Clear rendered messages for new room
    this.renderedMessageIds.clear();
    
    // Try WebSocket first, fall back to HTTP
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.wsSend({
        type: 'join_room',
        roomId
      });
    } else {
      this.joinRoomViaHTTP(roomId);
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
          pinnedMessages: []
        });
      }
    } catch (error) {
      console.error('Join room via HTTP failed:', error);
      this.showToast('Failed to load room', 'error');
    }
  }

  handleRoomJoined(data) {
    this.currentRoom = data.roomId;
    
    // Clear messages container
    if (this.chatElements.messages) {
      this.chatElements.messages.innerHTML = '';
    }
    this.lastMessageDate = null;
    this.renderedMessageIds.clear();

    // Store messages
    this.messages.set(this.currentRoom, data.messages || []);

    // Update polling service with last message ID
    this.pollingService.setRoom(this.currentRoom, data.lastMessageId);

    if (data.messages && data.messages.length > 0) {
      this.chatElements.welcomeMessage?.classList.add('hidden');
      data.messages.forEach(msg => this.renderMessage(msg, false));
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

    this.pinnedMessages = data.pinnedMessages || [];
  }

  updateRoomsList() {
    const container = this.sidebarElements.roomsList;
    if (!container) return;

    container.innerHTML = '';

    this.rooms.forEach(room => {
      const roomEl = document.createElement('div');
      roomEl.className = `room-item ${room.id === this.currentRoom ? 'active' : ''}`;
      roomEl.setAttribute('data-tooltip', room.name);
      roomEl.innerHTML = `
        <span class="room-icon">${room.icon || '💬'}</span>
        <span class="room-name">${this.escapeHtml(room.name)}</span>
      `;

      roomEl.addEventListener('click', () => {
        if (room.id !== this.currentRoom) {
          this.closeDMChat();
          this.joinRoom(room.id);
        }
      });

      container.appendChild(roomEl);
    });
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
    // Check if room already exists
    if (!this.rooms.find(r => r.id === room.id)) {
      this.rooms.push(room);
      this.updateRoomsList();
      this.showToast(`New channel: ${room.name}`, 'info');
    }
  }

  // ============================================
  // MESSAGING (WITH HTTP FALLBACK)
  // ============================================
  async sendMessage() {
    const text = this.chatElements.messageInput?.value.trim();

    if (!text && !this.attachment) return;

    // Clear input immediately for better UX
    if (this.chatElements.messageInput) {
      this.chatElements.messageInput.value = '';
      this.autoResizeTextarea(this.chatElements.messageInput);
    }

    const replyTo = this.replyingTo;
    const attachment = this.attachment;
    
    this.clearReply();
    this.clearAttachment();
    this.sendTypingStatus(false);

    // Try WebSocket first
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.wsSend({
        type: 'message',
        roomId: this.currentRoom,
        text: text || '',
        attachment: attachment,
        replyTo: replyTo
      });
    } else {
      // Fall back to HTTP
      try {
        const response = await this.apiRequest(`/api/messages/${this.currentRoom}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${this.token}` },
          body: JSON.stringify({
            text: text || '',
            attachment: attachment,
            replyTo: replyTo
          })
        });

        if (response.success) {
          this.handleNewMessage(response.message);
          // Update polling last message ID
          this.pollingService.lastRoomMessageId = response.message.id;
        } else {
          this.showToast(response.error || 'Failed to send message', 'error');
        }
      } catch (error) {
        console.error('Send message error:', error);
        this.showToast('Failed to send message', 'error');
      }
    }
  }

  handleNewMessage(message) {
    if (message.roomId !== this.currentRoom) return;

    // Deduplication check
    if (this.renderedMessageIds.has(message.id)) {
      console.log('[Dedup] Message already rendered:', message.id);
      return;
    }

    // Store message
    const roomMessages = this.messages.get(this.currentRoom) || [];
    if (!roomMessages.find(m => m.id === message.id)) {
      roomMessages.push(message);
      this.messages.set(this.currentRoom, roomMessages);
    }

    // Update polling last message ID
    this.pollingService.lastRoomMessageId = message.id;

    // Hide welcome message
    this.chatElements.welcomeMessage?.classList.add('hidden');

    // Render message
    this.renderMessage(message, true);

    // Play notification if not own message
    if (message.userId !== this.user?.id) {
      this.playNotificationSound();
      this.showDesktopNotification(message);
    }
  }

  renderMessage(message, scroll = true) {
    const container = this.chatElements.messages;
    if (!container) return;

    // Deduplication check
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

    const messageEl = document.createElement('div');
    messageEl.className = 'message';
    messageEl.dataset.messageId = message.id;
    messageEl.dataset.userId = message.userId;

    if (message.userId === this.user?.id) {
      messageEl.classList.add('own');
    }

    const avatar = message.avatar || this.generateDefaultAvatar(message.username);
    const time = this.formatTime(message.createdAt);
    const displayName = message.displayName || message.username;

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
      } else {
        const fileIcon = this.getFileIcon(message.attachment.type);
        attachmentHtml = `
          <div class="message-attachment file">
            <i class="fas ${fileIcon}"></i>
            <div class="file-info">
              <a href="${message.attachment.url}" target="_blank" rel="noopener">${this.escapeHtml(message.attachment.name)}</a>
              <span class="file-size">${this.formatFileSize(message.attachment.size)}</span>
            </div>
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

    messageEl.innerHTML = `
      <img class="message-avatar" src="${avatar}" alt="" 
           onclick="app.openUserProfile('${message.userId}')" loading="lazy">
      <div class="message-content">
        <div class="message-header">
          <span class="message-author" onclick="app.openUserProfile('${message.userId}')">${this.escapeHtml(displayName)}</span>
          <span class="message-time" title="${new Date(message.createdAt).toLocaleString()}">${time}</span>
          ${message.edited ? '<span class="message-edited">(edited)</span>' : ''}
        </div>
        ${replyHtml}
        <div class="message-text">${this.formatMessageText(message.text)}</div>
        ${attachmentHtml}
        ${threadHtml}
        <div class="message-reactions">${reactionsHtml}</div>
      </div>
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
        ${message.userId === this.user?.id ? `
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
      </div>
    `;

    container.appendChild(messageEl);

    if (scroll) {
      this.scrollToBottom();
    }
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

    // URLs
    formatted = formatted.replace(
      /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    // Mentions (@username)
    formatted = formatted.replace(
      /@(\w+)/g,
      '<span class="mention" onclick="app.handleMentionClick(\'$1\')">@$1</span>'
    );

    // Bold (**text**)
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic (*text*)
    formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Code (`code`)
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Strikethrough (~~text~~)
    formatted = formatted.replace(/~~(.+?)~~/g, '<del>$1</del>');

    // Newlines
    formatted = formatted.replace(/\n/g, '<br>');

    return formatted;
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

    const newText = prompt('Edit message:', message.text);
    if (newText !== null && newText.trim() !== message.text) {
      this.wsSend({
        type: 'edit_message',
        messageId,
        text: newText.trim()
      });
    }
  }

  deleteMessage(messageId) {
    const message = this.findMessage(messageId);
    if (!message || message.userId !== this.user?.id) return;

    if (confirm('Delete this message?')) {
      this.wsSend({
        type: 'delete_message',
        messageId
      });
    }
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

    // Update stored message
    const roomMessages = this.messages.get(this.currentRoom) || [];
    const msg = roomMessages.find(m => m.id === data.messageId);
    if (msg) {
      msg.text = data.text;
      msg.edited = true;
    }
  }

  handleMessageDeleted(data) {
    const messageEl = document.querySelector(`[data-message-id="${data.messageId}"]`);
    if (messageEl) {
      messageEl.classList.add('deleted');
      setTimeout(() => messageEl.remove(), 300);
    }

    // Remove from rendered set
    this.renderedMessageIds.delete(data.messageId);

    // Remove from stored messages
    const roomMessages = this.messages.get(this.currentRoom) || [];
    const index = roomMessages.findIndex(m => m.id === data.messageId);
    if (index > -1) {
      roomMessages.splice(index, 1);
    }
  }

  // Reactions
  addReaction(messageId) {
    const quickReactions = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👀'];

    // Remove existing picker
    document.querySelectorAll('.quick-reactions').forEach(el => el.remove());

    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageEl) return;

    const picker = document.createElement('div');
    picker.className = 'quick-reactions';
    picker.innerHTML = quickReactions.map(emoji =>
      `<button onclick="app.toggleReaction('${messageId}', '${emoji}'); this.parentElement.remove();">${emoji}</button>`
    ).join('');

    messageEl.appendChild(picker);
    setTimeout(() => picker.remove(), 5000);
  }

  toggleReaction(messageId, emoji) {
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

    // Update stored message
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

  showSystemMessage(text) {
    const container = this.chatElements.messages;
    if (!container) return;

    const messageEl = document.createElement('div');
    messageEl.className = 'system-message';
    messageEl.innerHTML = `<i class="fas fa-info-circle"></i> ${this.escapeHtml(text)}`;
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
      this.typingUsers.set(data.userId, data.username);
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
      text = `${users[0]} is typing`;
    } else if (users.length === 2) {
      text = `${users[0]} and ${users[1]} are typing`;
    } else {
      text = `${users[0]} and ${users.length - 1} others are typing`;
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

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      this.showToast('File size must be less than 10MB', 'error');
      return;
    }

    this.uploadFile(file);
    event.target.value = '';
  }

  async uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    this.showToast('Uploading file...', 'info');

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
        this.showToast('File uploaded', 'success');
      } else {
        this.showToast(data.error || 'Upload failed', 'error');
      }
    } catch (error) {
      console.error('Upload error:', error);
      this.showToast('Failed to upload file', 'error');
    }
  }

  showAttachmentPreview(file) {
    const preview = this.chatElements.attachmentPreview;
    if (!preview) return;

    preview.classList.add('active');
    const nameEl = preview.querySelector('.attachment-name');
    const sizeEl = preview.querySelector('.attachment-size');
    if (nameEl) nameEl.textContent = file.name;
    if (sizeEl) sizeEl.textContent = this.formatFileSize(file.size);
  }

  clearAttachment() {
    this.attachment = null;
    this.chatElements.attachmentPreview?.classList.remove('active');
  }

  getFileIcon(mimeType) {
    if (!mimeType) return 'fa-file';
    if (mimeType.startsWith('image/')) return 'fa-file-image';
    if (mimeType.startsWith('video/')) return 'fa-file-video';
    if (mimeType.startsWith('audio/')) return 'fa-file-audio';
    if (mimeType.includes('pdf')) return 'fa-file-pdf';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'fa-file-word';
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'fa-file-excel';
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('archive')) return 'fa-file-archive';
    if (mimeType.includes('text')) return 'fa-file-alt';
    return 'fa-file';
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

    this.mentionUsers = users.slice(0, 8);
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
        <img class="mention-avatar" src="${user.avatar || this.generateDefaultAvatar(user.username)}" alt="">
        <span class="mention-name">${this.escapeHtml(user.displayName || user.username)}</span>
        <span class="mention-username">@${this.escapeHtml(user.username)}</span>
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
    }
  }

  // ============================================
  // DIRECT MESSAGES
  // ============================================
  async loadDMConversations() {
    try {
      const response = await this.apiRequest('/api/dm', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      if (response.conversations) {
        this.dmConversations = response.conversations;
        this.renderDMList();
      }
    } catch (error) {
      console.error('Error loading DM conversations:', error);
    }
  }

  renderDMList() {
    const container = this.sidebarElements.dmList;
    if (!container) return;

    if (this.dmConversations.length === 0) {
      container.innerHTML = `
        <div class="dm-empty-hint">
          <p>No conversations yet</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.dmConversations.map(conv => {
      const user = conv.participant;
      const isOnline = this.onlineUsers.has(user.id);
      const status = isOnline ? 'online' : 'offline';

      return `
        <div class="dm-item" data-user-id="${user.id}" data-tooltip="${this.escapeHtml(user.displayName || user.username)}">
          <div class="user-avatar-container">
            <img class="user-avatar" src="${user.avatar || this.generateDefaultAvatar(user.username)}" alt="">
            <span class="status-dot ${status}"></span>
          </div>
          <div class="dm-info">
            <span class="dm-name">${this.escapeHtml(user.displayName || user.username)}</span>
            ${conv.lastMessage ? `
              <span class="dm-preview">${this.escapeHtml(this.truncateText(conv.lastMessage.text, 25))}</span>
            ` : ''}
          </div>
          ${conv.unreadCount > 0 ? `<span class="dm-badge">${conv.unreadCount}</span>` : ''}
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
      .filter(u => u.id !== this.user?.id);

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
          <img class="user-avatar" src="${user.avatar || this.generateDefaultAvatar(user.username)}" alt="">
          <span class="status-dot ${user.status || 'online'}"></span>
        </div>
        <div class="dm-user-item-info">
          <span class="dm-user-item-name">${this.escapeHtml(user.displayName || user.username)}</span>
          <span class="dm-user-item-status">${user.status || 'Online'}</span>
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
          <p>No users found</p>
        </div>
      `;
      return;
    }

    container.innerHTML = users.map(user => `
      <div class="dm-user-item" data-user-id="${user.id}">
        <div class="user-avatar-container">
          <img class="user-avatar" src="${user.avatar || this.generateDefaultAvatar(user.username)}" alt="">
          <span class="status-dot ${user.status || 'online'}"></span>
        </div>
        <div class="dm-user-item-info">
          <span class="dm-user-item-name">${this.escapeHtml(user.displayName || user.username)}</span>
          <span class="dm-user-item-status">${user.status || 'Online'}</span>
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
    console.log('Opening DM chat with user:', userId);

    const user = this.onlineUsers.get(userId) || 
                 this.dmConversations.find(c => c.participant.id === userId)?.participant;

    if (!user) {
      this.showToast('User not found', 'error');
      return;
    }

    this.currentDM = userId;
    this.renderedDMIds.clear();

    if (this.dmElements.userAvatar) {
      this.dmElements.userAvatar.src = user.avatar || this.generateDefaultAvatar(user.username);
    }
    if (this.dmElements.userName) {
      this.dmElements.userName.textContent = user.displayName || user.username;
    }
    const isOnline = this.onlineUsers.has(userId);
    if (this.dmElements.userStatus) {
      this.dmElements.userStatus.className = `status-indicator ${isOnline ? 'online' : 'offline'}`;
    }
    if (this.dmElements.userStatusText) {
      this.dmElements.userStatusText.textContent = isOnline ? 'Online' : 'Offline';
    }

    this.dmElements.view?.classList.add('active');

    await this.loadDMMessages(userId);
  }

  async loadDMMessages(userId) {
    try {
      const response = await this.apiRequest(`/api/dm/${userId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      if (response.messages) {
        this.renderDMMessages(response.messages);
      }
    } catch (error) {
      console.error('Error loading DM messages:', error);
      this.showToast('Failed to load messages', 'error');
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
      const avatar = msg.avatar || this.generateDefaultAvatar(msg.username);
      const time = this.formatTime(msg.createdAt);

      return `
        <div class="message ${isOwn ? 'own' : ''}" data-message-id="${msg.id}">
          <img class="message-avatar" src="${avatar}" alt="">
          <div class="message-content">
            <div class="message-header">
              <span class="message-author">${this.escapeHtml(msg.displayName || msg.username)}</span>
              <span class="message-time">${time}</span>
            </div>
            <div class="message-text">${this.formatMessageText(msg.text)}</div>
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

    const text = input.value ? input.value.trim() : '';

    if (!text) {
      this.showToast('Please enter a message', 'warning');
      input.focus();
      return;
    }

    if (!this.currentDM) {
      this.showToast('No conversation selected', 'error');
      return;
    }

    // Clear input immediately
    input.value = '';
    input.style.height = 'auto';

    const sendBtn = this.dmElements.sendBtn;
    if (sendBtn) sendBtn.disabled = true;

    try {
      const response = await this.apiRequest(`/api/dm/${this.currentDM}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` },
        body: JSON.stringify({ text: text })
      });

      if (response.success) {
        this.appendDMMessage(response.message);
      } else {
        this.showToast(response.error || 'Failed to send message', 'error');
      }
    } catch (error) {
      console.error('Error sending DM:', error);
      this.showToast('Failed to send message', 'error');
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      input.focus();
    }
  }

  appendDMMessage(message) {
    const container = this.dmElements.messages;
    if (!container) return;

    // Deduplication check
    if (this.renderedDMIds.has(message.id)) {
      console.log('[Dedup] DM already rendered:', message.id);
      return;
    }
    this.renderedDMIds.add(message.id);

    // Remove empty state if exists
    container.querySelector('.dm-empty-state')?.remove();

    const isOwn = message.userId === this.user?.id;
    const avatar = message.avatar || this.generateDefaultAvatar(message.username);
    const time = this.formatTime(message.createdAt);

    const messageEl = document.createElement('div');
    messageEl.className = `message ${isOwn ? 'own' : ''}`;
    messageEl.dataset.messageId = message.id;
    messageEl.innerHTML = `
      <img class="message-avatar" src="${avatar}" alt="">
      <div class="message-content">
        <div class="message-header">
          <span class="message-author">${this.escapeHtml(message.displayName || message.username)}</span>
          <span class="message-time">${time}</span>
        </div>
        <div class="message-text">${this.formatMessageText(message.text)}</div>
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
    if (this.dmElements.messages) {
      this.dmElements.messages.innerHTML = '';
    }
    if (this.dmElements.input) {
      this.dmElements.input.value = '';
    }
  }

  handleDMReceived(data) {
    console.log('DM received:', data);

    // Deduplication check
    if (this.renderedDMIds.has(data.message.id)) {
      console.log('[Dedup] DM already exists:', data.message.id);
      return;
    }

    if (this.dmElements.view?.classList.contains('active') && this.currentDM === data.message.userId) {
      this.appendDMMessage(data.message);
    } else {
      this.showToast(`New message from ${data.message.displayName || data.message.username}`, 'info');
      this.playNotificationSound();
    }

    this.loadDMConversations();
  }

  sendDMFromProfile() {
    const modal = this.modals.userProfile;
    const usernameEl = modal?.querySelector('.profile-username');
    if (!usernameEl) return;

    const username = usernameEl.textContent?.replace('@', '');
    const user = Array.from(this.onlineUsers.values()).find(
      u => u.username === username
    );

    if (user) {
      this.closeAllModals();
      this.openDMChat(user.id);
    } else {
      this.showToast('User is offline', 'error');
    }
  }

  // ============================================
  // THREADS
  // ============================================
  async openThread(messageId) {
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

    const parentAvatar = parentMessage.avatar || this.generateDefaultAvatar(parentMessage.username);
    parentContainer.innerHTML = `
      <div class="thread-message">
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
          <p>No replies yet. Start the conversation!</p>
        </div>
      `;
    } else {
      repliesContainer.innerHTML = replies.map(reply => {
        const avatar = reply.avatar || this.generateDefaultAvatar(reply.username);
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

    try {
      const response = await this.apiRequest(`/api/threads/${this.currentThread}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` },
        body: JSON.stringify({ text })
      });

      if (response.success) {
        this.appendThreadReply(response.message);
        if (input) input.value = '';
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

    const avatar = message.avatar || this.generateDefaultAvatar(message.username);
    const replyEl = document.createElement('div');
    replyEl.className = 'thread-message reply';
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
      const avatar = msg.avatar || this.generateDefaultAvatar(msg.username);
      return `
        <div class="pinned-message" onclick="app.scrollToMessage('${msg.id}'); app.closePinnedPanel();">
          <div class="pinned-message-header">
            <img class="message-avatar" src="${avatar}" alt="">
            <span class="message-author">${this.escapeHtml(msg.displayName || msg.username)}</span>
            <span class="message-time">${this.formatTime(msg.createdAt)}</span>
            <button class="btn-icon-tiny" onclick="event.stopPropagation(); app.unpinMessage('${msg.id}');" title="Unpin">
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
    this.showToast('A message was unpinned', 'info');
    if (this.pinnedElements.panel?.classList.contains('active')) {
      this.loadPinnedMessages();
    }
  }

  // ============================================
  // USERS
  // ============================================
  updateUsersList() {
    const container = this.sidebarElements.usersList;
    if (!container) return;

    const sortedUsers = Array.from(this.onlineUsers.values()).sort((a, b) => {
      if (a.id === this.user?.id) return -1;
      if (b.id === this.user?.id) return 1;
      const statusOrder = { online: 0, away: 1, dnd: 2, invisible: 3, offline: 4 };
      return (statusOrder[a.status] || 4) - (statusOrder[b.status] || 4);
    });

    container.innerHTML = sortedUsers.map(user => {
      const displayName = user.displayName || user.username;
      const avatar = user.avatar || this.generateDefaultAvatar(user.username);
      const isYou = user.id === this.user?.id;

      return `
        <div class="user-item" data-user-id="${user.id}" data-tooltip="${this.escapeHtml(displayName)}">
          <div class="user-avatar-container">
            <img class="user-avatar" src="${avatar}" alt="">
            <span class="status-dot ${user.status || 'online'}"></span>
          </div>
          <span class="user-name">${this.escapeHtml(displayName)}</span>
          ${isYou ? '<span class="you-badge">you</span>' : ''}
        </div>
      `;
    }).join('');

    container.querySelectorAll('.user-item').forEach(item => {
      item.addEventListener('click', () => {
        this.openUserProfile(item.dataset.userId);
      });
    });

    if (this.sidebarElements.onlineCount) {
      this.sidebarElements.onlineCount.textContent = this.onlineUsers.size;
    }
    if (this.headerElements.membersCount) {
      this.headerElements.membersCount.textContent = this.onlineUsers.size;
    }
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
        status: data.status
      });
    }

    this.updateUsersList();
    this.renderDMList();
  }

  async openUserProfile(userId) {
    try {
      const response = await this.apiRequest(`/api/users/${userId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });

      if (!response.user) {
        this.showToast('User not found', 'error');
        return;
      }

      const user = response.user;
      const modal = this.modals.userProfile;
      if (!modal) return;

      const avatar = user.avatar || this.generateDefaultAvatar(user.username);
      const isOnline = this.onlineUsers.has(userId);
      const status = isOnline ? 'online' : 'offline';

      const avatarEl = modal.querySelector('.profile-avatar');
      const statusEl = modal.querySelector('.profile-status-indicator');
      const nameEl = modal.querySelector('.profile-name');
      const usernameEl = modal.querySelector('.profile-username');
      const badgeEl = modal.querySelector('.profile-status-badge');
      const bioEl = modal.querySelector('.profile-bio');
      const joinedEl = modal.querySelector('.profile-joined');
      const userIdEl = modal.querySelector('.profile-user-id');

      if (avatarEl) avatarEl.src = avatar;
      if (statusEl) statusEl.className = `profile-status-indicator ${status}`;
      if (nameEl) nameEl.textContent = user.displayName || user.username;
      if (usernameEl) usernameEl.textContent = `@${user.username}`;
      if (badgeEl) {
        badgeEl.textContent = isOnline ? 'Online' : 'Offline';
        badgeEl.className = `profile-status-badge ${status}`;
      }
      if (bioEl) bioEl.textContent = user.bio || 'No bio yet';
      if (joinedEl) joinedEl.textContent = this.formatDateFull(user.createdAt);
      if (userIdEl) userIdEl.textContent = user.id;

      this.openModal('userProfile');
    } catch (error) {
      console.error('Error loading user profile:', error);
      this.showToast('Failed to load profile', 'error');
    }
  }

  changeStatus(status) {
    this.wsSend({
      type: 'status_change',
      status
    });

    const indicator = document.querySelector('.user-profile .status-indicator');
    if (indicator) {
      indicator.className = `status-indicator ${status}`;
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
    }
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
    }
  }

  // ============================================
  // CONTEXT MENU
  // ============================================
  showContextMenu(event, messageEl) {
    this.contextMenuTarget = messageEl;
    const userId = messageEl.dataset.userId;
    const isOwn = userId === this.user?.id;

    const editItem = this.contextMenu?.querySelector('[data-action="edit"]');
    const deleteItem = this.contextMenu?.querySelector('[data-action="delete"]');

    if (editItem) editItem.style.display = isOwn ? 'flex' : 'none';
    if (deleteItem) deleteItem.style.display = isOwn ? 'flex' : 'none';

    if (this.contextMenu) {
      this.contextMenu.style.left = `${event.pageX}px`;
      this.contextMenu.style.top = `${event.pageY}px`;
      this.contextMenu.classList.add('active');
    }
  }

  hideContextMenu() {
    this.contextMenu?.classList.remove('active');
    this.contextMenuTarget = null;
  }

  handleContextMenuAction(action) {
    if (!this.contextMenuTarget) return;

    const messageId = this.contextMenuTarget.dataset.messageId;

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
        const link = `${window.location.origin}#message-${messageId}`;
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
    if (this.sidebarOpen) {
      this.closeMobileSidebar();
    } else {
      this.openMobileSidebar();
    }
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

    if (this.settingsModalElements.soundToggle) {
      this.settingsModalElements.soundToggle.checked = this.settings.soundEnabled;
    }
    if (this.settingsModalElements.desktopNotificationsToggle) {
      this.settingsModalElements.desktopNotificationsToggle.checked = this.settings.desktopNotifications;
    }
  }

  async saveSettings() {
    const displayName = this.settingsModalElements.displayName?.value.trim();
    const bio = this.settingsModalElements.bio?.value.trim();
    const theme = this.settingsModalElements.themeSelect?.value;
    const soundEnabled = this.settingsModalElements.soundToggle?.checked;
    const desktopNotifications = this.settingsModalElements.desktopNotificationsToggle?.checked;

    try {
      const response = await this.apiRequest('/api/users/profile', {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${this.token}` },
        body: JSON.stringify({
          displayName,
          bio,
          theme,
          notificationSound: soundEnabled,
          desktopNotifications
        })
      });

      if (response.success) {
        this.user = response.user;
        this.settings.soundEnabled = soundEnabled;
        this.settings.desktopNotifications = desktopNotifications;
        localStorage.setItem('chatSettings', JSON.stringify(this.settings));

        this.setTheme(theme);
        this.updateUI();
        this.closeAllModals();
        this.showToast('Settings saved', 'success');

        if (desktopNotifications && 'Notification' in window) {
          Notification.requestPermission();
        }
      } else {
        this.showToast(response.error || 'Failed to save settings', 'error');
      }
    } catch (error) {
      console.error('Save settings error:', error);
      this.showToast('Failed to save settings', 'error');
    }
  }

  async uploadAvatar(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('avatar', file);

    try {
      const response = await fetch('/api/users/avatar', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` },
        body: formData
      });

      const data = await response.json();

      if (response.ok && data.success) {
        this.user.avatar = data.avatar;
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
  // THEME
  // ============================================
  initTheme() {
    const saved = localStorage.getItem('chatTheme') || 'dark';
    this.setTheme(saved);
  }

  toggleTheme() {
    const current = document.documentElement.dataset.theme;
    const themes = ['dark', 'light', 'midnight', 'nature', 'sunset'];
    const currentIndex = themes.indexOf(current);
    const nextIndex = (currentIndex + 1) % themes.length;
    this.setTheme(themes[nextIndex]);
  }

  setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('chatTheme', theme);

    const icon = this.headerElements.themeToggle?.querySelector('i');
    if (icon) {
      const icons = {
        dark: 'fa-moon',
        light: 'fa-sun',
        midnight: 'fa-star',
        nature: 'fa-leaf',
        sunset: 'fa-cloud-sun'
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
      smileys: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠'],
      people: ['👋', '🤚', '🖐', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪'],
      animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞'],
      food: ['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶', '🫑', '🌽', '🥕', '🫒', '🧄', '🧅', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🌭', '🍔', '🍟', '🍕'],
      activities: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🥅', '⛳', '🏹', '🎣', '🥊', '🥋', '🎽', '🛹', '🛷', '⛸', '🥌', '🎿', '⛷', '🏂'],
      travel: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🛴', '🚲', '🛵', '🏍', '✈️', '🚀', '🛸', '🚁', '🛶', '⛵', '🚤', '🛥', '🛳', '⛴', '🚢'],
      objects: ['⌚', '📱', '📲', '💻', '⌨️', '🖥', '🖨', '🖱', '🖲', '💽', '💾', '💿', '📀', '📷', '📸', '📹', '🎥', '📽', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙', '🎚', '🎛', '⏱', '⏲', '⏰', '🕰', '⌛', '⏳', '📡', '🔋', '🔌', '💡', '🔦', '🕯'],
      symbols: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️']
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

    grid.innerHTML = allEmojis.slice(0, 50).map(emoji =>
      `<button class="emoji-btn" type="button" onclick="app.insertEmoji('${emoji}')">${emoji}</button>`
    ).join('');
  }

  insertEmoji(emoji) {
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
  playNotificationSound() {
    if (!this.settings.soundEnabled) return;

    try {
      const sound = this.sounds.notification;
      if (sound) {
        sound.currentTime = 0;
        sound.volume = 0.5;
        sound.play().catch(() => {});
      }
    } catch (e) {
      console.error('Error playing notification sound:', e);
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
        tag: message.id
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

    const avatar = this.user.avatar || this.generateDefaultAvatar(this.user.username);

    if (this.userProfileElements.avatar) {
      this.userProfileElements.avatar.src = avatar;
    }
    if (this.userProfileElements.displayName) {
      this.userProfileElements.displayName.textContent = this.user.displayName || this.user.username;
    }
    if (this.userProfileElements.username) {
      this.userProfileElements.username.textContent = `@${this.user.username}`;
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
  }

  openModal(modal) {
    this.modals[modal]?.classList.add('active');
  }

  closeAllModals() {
    Object.values(this.modals).forEach(m => m?.classList.remove('active'));
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
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  setButtonLoading(button, loading, text) {
    if (!button) return;

    if (loading) {
      button.disabled = true;
      button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${text}`;
    } else {
      button.disabled = false;
      button.innerHTML = `<span>${text}</span><i class="fas fa-arrow-right"></i>`;
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
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  formatDateFull(dateString) {
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
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  generateDefaultAvatar(username) {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
      '#F8B500', '#00D4AA', '#FF6F61', '#6B5B95', '#88B04B'
    ];
    const color = colors[(username || 'U').charCodeAt(0) % colors.length];
    const initial = ((username || 'U')[0] || 'U').toUpperCase();

    return `data:image/svg+xml,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
        <rect width="100" height="100" fill="${color}"/>
        <text x="50" y="50" dy="0.35em" text-anchor="middle" 
              font-family="Arial, sans-serif" font-size="45" font-weight="bold" fill="white">
          ${initial}
        </text>
      </svg>
    `)}`;
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
// INITIALIZE APPLICATION
// ============================================
const app = new ChatApp();

// Make app globally accessible for onclick handlers
window.app = app;

console.log('🚀 ChatHub with Polling Support initialized');