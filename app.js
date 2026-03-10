// ============================================
// CHATHUB - COMPLETE APPLICATION
// Enhanced with Master Admin Panel
// ============================================

(function() {
    'use strict';

    // ============================================
    // CONFIGURATION
    // ============================================
    const CONFIG = {
        // Master Admin Credentials (hardcoded for this implementation)
        MASTER_CREDENTIALS: {
            username: 'charles master',
            password: 'king1master',
            displayName: 'Charles Master',
            role: 'master'
        },

        // Theme options
        THEMES: ['dark', 'light', 'midnight', 'nature', 'sunset', 'ocean', 'cherry', 'cyberpunk', 'lavender', 'mocha', 'arctic', 'volcano', 'galaxy', 'forest', 'retro'],

        // File limits
        MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
        MAX_AVATAR_SIZE: 5 * 1024 * 1024, // 5MB

        // Connection settings
        RECONNECT_DELAY: 2000,
        MAX_RECONNECT_ATTEMPTS: 10,
        TYPING_TIMEOUT: 2000,
        TOAST_DURATION: 4000,
        MESSAGE_BATCH_SIZE: 50,
        SCROLL_THRESHOLD: 100,
        DEBOUNCE_DELAY: 300,

        // Storage keys
        STORAGE_KEYS: {
            TOKEN: 'chathub_token',
            THEME: 'chathub_theme',
            SETTINGS: 'chathub_settings',
            DRAFT: 'chathub_draft',
            LAST_ROOM: 'chathub_last_room',
            ADMIN_DATA: 'chathub_admin_data'
        },

        // Role hierarchy (lower number = higher rank)
        ROLE_HIERARCHY: {
            master: 0,
            admin: 1,
            mod: 2,
            member: 3
        },

        // Default system settings
        DEFAULT_SYSTEM_SETTINGS: {
            siteName: 'ChatHub',
            welcomeMessage: 'Welcome to ChatHub! 👋',
            maxFileSize: 10,
            allowRegistration: true,
            emailVerification: false,
            inviteOnly: false,
            messageLimit: 2000,
            allowUploads: true,
            enableReactions: true,
            linkPreviews: true,
            profanityFilter: false,
            spamProtection: true,
            newUserSlowmode: 5,
            maintenanceMode: false
        }
    };

    // ============================================
    // EMOJI DATA
    // ============================================
    const EMOJIS = {
        smileys: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😌', '😍', '🥰', '😘', '😋', '😛', '😜', '🤪', '😎', '🤩', '🥳', '😏', '😒', '😔', '😢', '😭', '😤', '😠', '😡', '🤬', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '💀', '👻', '👽', '🤖', '💩', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾'],
        people: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '💪', '🦾', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '👀', '👁️', '👅', '👄', '💋'],
        animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜', '🦟', '🦗', '🕷️', '🦂', '🐢', '🐍', '🦎', '🦖', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈'],
        food: ['🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🫒', '🧄', '🧅', '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🌭', '🍔', '🍟', '🍕'],
        activities: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷', '⛸️', '🥌', '🎿', '⛷️', '🏂', '🪂', '🏋️', '🎮', '🎲', '♟️', '🎯', '🎳', '🎰', '🧩'],
        travel: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🏍️', '🛵', '🚲', '🛴', '🛹', '✈️', '🛫', '🛬', '🚀', '🛸', '🚁', '🛶', '⛵', '🚤', '🛥️', '🛳️', '⛴️', '🚢', '🗼', '🗽', '🗿', '🏰', '🏯', '🎡', '🎢', '🎠', '⛱️', '🏖️', '🏝️', '🏜️', '🌋', '⛰️', '🏔️'],
        objects: ['⌚', '📱', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '💽', '💾', '💿', '📀', '📷', '📸', '📹', '🎥', '📽️', '📞', '☎️', '📠', '📺', '📻', '🎙️', '🎚️', '🎛️', '⏱️', '⏲️', '⏰', '🕰️', '💡', '🔦', '🕯️', '💎', '💰', '💳', '💸', '🔑', '🗝️', '🔨', '🪓', '⛏️', '⚒️', '🛠️', '🔧', '🔩', '⚙️'],
        symbols: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗', '❕', '❓', '❔', '‼️', '⁉️', '🔅', '🔆', '〽️', '⚠️', '🚸', '🔱', '⚜️', '🔰', '♻️', '✅', '🈯', '💹', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️', '🌀', '💤', '🏧', '🚾', '♿', '🅿️', '🛗']
    };

    // ============================================
    // APPLICATION STATE
    // ============================================
    const state = {
        // User state
        user: null,
        token: null,
        isMaster: false,

        // Connection state
        socket: null,
        isConnecting: false,
        reconnectAttempts: 0,
        reconnectTimeout: null,
        messageQueue: [],

        // Chat state
        currentRoom: 'general',
        rooms: [],
        messages: new Map(),
        onlineUsers: new Map(),
        allUsers: new Map(),
        typingUsers: new Map(),
        unreadCounts: new Map(),
        pinnedMessages: new Map(),

        // Input state
        replyingTo: null,
        editingMessage: null,
        attachment: null,
        isTyping: false,
        typingTimeout: null,
        isScrolledToBottom: true,

        // UI state
        currentEmojiCategory: 'smileys',
        emojiSearchQuery: '',
        rightSidebarOpen: false,
        currentAdminPanel: 'dashboard',

        // Admin state
        adminData: {
            stats: {
                totalUsers: 0,
                onlineUsers: 0,
                totalMessages: 0,
                totalRooms: 0,
                newUsersToday: 0,
                messagestoday: 0
            },
            activityLogs: [],
            reports: [],
            announcements: [],
            bannedUsers: [],
            systemSettings: { ...CONFIG.DEFAULT_SYSTEM_SETTINGS }
        },

        // User settings
        settings: {
            soundEnabled: true,
            desktopNotifications: false,
            compactMode: false,
            showTimestamps: true,
            messagePreview: true,
            enterToSend: true,
            use24h: false,
            fontSize: 'medium',
            showOnlineStatus: true,
            showTyping: true,
            readReceipts: true
        }
    };

    // ============================================
    // DOM HELPERS
    // ============================================
    const elements = {};

    function $(id) {
        if (!elements[id]) {
            elements[id] = document.getElementById(id);
        }
        return elements[id];
    }

    function $$(selector) {
        return document.querySelectorAll(selector);
    }

    function clearElementCache() {
        Object.keys(elements).forEach(key => delete elements[key]);
    }

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    const Utils = {
        escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },

        truncate(text, length) {
            if (!text) return '';
            return text.length > length ? text.substring(0, length) + '...' : text;
        },

        debounce(fn, delay) {
            let timeout;
            return (...args) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => fn(...args), delay);
            };
        },

        throttle(fn, limit) {
            let inThrottle;
            return (...args) => {
                if (!inThrottle) {
                    fn(...args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        },

        formatTime(dateStr) {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            const now = new Date();
            const diff = now - date;

            if (diff < 60000) return 'Just now';
            if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;

            const options = { hour: '2-digit', minute: '2-digit', hour12: !state.settings.use24h };

            if (date.toDateString() === now.toDateString()) {
                return date.toLocaleTimeString([], options);
            }

            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            if (date.toDateString() === yesterday.toDateString()) {
                return `Yesterday ${date.toLocaleTimeString([], options)}`;
            }

            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        },

        formatDateFull(dateStr) {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            const now = new Date();

            if (date.toDateString() === now.toDateString()) return 'Today';

            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

            const weekAgo = new Date(now);
            weekAgo.setDate(weekAgo.getDate() - 7);
            if (date > weekAgo) {
                return date.toLocaleDateString([], { weekday: 'long' });
            }

            return date.toLocaleDateString([], {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
            });
        },

        formatDateTime(dateStr) {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            return date.toLocaleString([], {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        },

        formatFileSize(bytes) {
            if (!bytes || bytes === 0) return '0 B';
            const units = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(1024));
            return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
        },

        getFileIcon(mimeType) {
            if (!mimeType) return 'fa-file';
            const icons = {
                'image': 'fa-file-image',
                'video': 'fa-file-video',
                'audio': 'fa-file-audio',
                'pdf': 'fa-file-pdf',
                'word': 'fa-file-word',
                'excel': 'fa-file-excel',
                'powerpoint': 'fa-file-powerpoint',
                'zip': 'fa-file-archive',
                'rar': 'fa-file-archive',
                'text': 'fa-file-alt',
                'code': 'fa-file-code'
            };

            for (const [key, icon] of Object.entries(icons)) {
                if (mimeType.includes(key)) return icon;
            }
            return 'fa-file';
        },

        generateAvatar(username) {
            const colors = [
                '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
                '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
                '#F8B500', '#00D4AA', '#FF6F61', '#6B5B95', '#88B04B'
            ];
            const name = username || 'U';
            const color = colors[(name.charCodeAt(0) + name.length) % colors.length];
            const initial = name[0].toUpperCase();

            return `data:image/svg+xml,${encodeURIComponent(`
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
                    <rect width="100" height="100" fill="${color}"/>
                    <text x="50%" y="50%" dy="0.35em" text-anchor="middle" 
                          font-family="Arial, sans-serif" font-size="45" font-weight="bold" fill="white">
                        ${initial}
                    </text>
                </svg>
            `)}`;
        },

        getRoleBadge(role) {
            const badges = {
                master: '<span class="role-badge master">👑 Master</span>',
                admin: '<span class="role-badge admin">Admin</span>',
                mod: '<span class="role-badge mod">Mod</span>'
            };
            return badges[role] || '';
        },

        getRoleColor(role) {
            const colors = {
                master: '#fbbf24',
                admin: '#ef4444',
                mod: '#22c55e',
                member: '#6b6b80'
            };
            return colors[role] || colors.member;
        },

        generateId() {
            return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        },

        copyToClipboard(text) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                return navigator.clipboard.writeText(text);
            }
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                return Promise.resolve();
            } catch (err) {
                return Promise.reject(err);
            } finally {
                document.body.removeChild(textarea);
            }
        },

        isMobile() {
            return window.innerWidth <= 768;
        },

        canModerate(userRole, targetRole) {
            const hierarchy = CONFIG.ROLE_HIERARCHY;
            return hierarchy[userRole] < hierarchy[targetRole];
        },

        hasPermission(permission) {
            const role = state.user?.role;
            if (role === 'master') return true;

            const permissions = {
                admin: ['manage_users', 'manage_rooms', 'delete_messages', 'ban_users', 'mute_users', 'kick_users', 'view_logs'],
                mod: ['delete_messages', 'mute_users', 'kick_users'],
                member: []
            };

            return permissions[role]?.includes(permission) || false;
        },

        downloadJson(data, filename) {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    };

    // ============================================
    // STORAGE MANAGER
    // ============================================
    const Storage = {
        get(key, defaultValue = null) {
            try {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : defaultValue;
            } catch (e) {
                console.error('Storage get error:', e);
                return defaultValue;
            }
        },

        set(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (e) {
                console.error('Storage set error:', e);
                return false;
            }
        },

        remove(key) {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (e) {
                return false;
            }
        },

        clear() {
            try {
                Object.values(CONFIG.STORAGE_KEYS).forEach(key => {
                    localStorage.removeItem(key);
                });
                return true;
            } catch (e) {
                return false;
            }
        }
    };

    // ============================================
    // API CLIENT
    // ============================================
    const API = {
        async request(url, options = {}) {
            const headers = {
                'Content-Type': 'application/json',
                ...options.headers
            };

            if (options.token || state.token) {
                headers['Authorization'] = `Bearer ${options.token || state.token}`;
            }

            const fetchOptions = {
                method: options.method || 'GET',
                headers
            };

            if (options.body) {
                fetchOptions.body = JSON.stringify(options.body);
            }

            try {
                const response = await fetch(url, fetchOptions);
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || `HTTP ${response.status}`);
                }

                return data;
            } catch (error) {
                console.error('API request error:', error);
                throw error;
            }
        },

        async upload(url, formData, options = {}) {
            const headers = {};

            if (options.token || state.token) {
                headers['Authorization'] = `Bearer ${options.token || state.token}`;
            }

            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers,
                    body: formData
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || `HTTP ${response.status}`);
                }

                return data;
            } catch (error) {
                console.error('Upload error:', error);
                throw error;
            }
        }
    };

    // ============================================
    // TOAST NOTIFICATIONS
    // ============================================
    const Toast = {
        show(message, type = 'info', duration = CONFIG.TOAST_DURATION) {
            const container = $('toast-container');
            if (!container) return;

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
                <span>${Utils.escapeHtml(message)}</span>
                <button class="toast-close" aria-label="Close">
                    <i class="fas fa-times"></i>
                </button>
            `;

            toast.querySelector('.toast-close').onclick = () => this.dismiss(toast);
            container.appendChild(toast);
            requestAnimationFrame(() => toast.classList.add('show'));

            const timeoutId = setTimeout(() => this.dismiss(toast), duration);
            toast.dataset.timeoutId = timeoutId;

            return toast;
        },

        dismiss(toast) {
            if (!toast || !toast.parentElement) return;
            clearTimeout(parseInt(toast.dataset.timeoutId));
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        },

        success(message) { return this.show(message, 'success'); },
        error(message) { return this.show(message, 'error'); },
        warning(message) { return this.show(message, 'warning'); },
        info(message) { return this.show(message, 'info'); }
    };

    // ============================================
    // MODAL MANAGER
    // ============================================
    const Modal = {
        open(id) {
            const modal = $(id);
            if (!modal) return;
            modal.classList.add('show');
            document.body.style.overflow = 'hidden';
            setTimeout(() => {
                const firstInput = modal.querySelector('input:not([disabled]), textarea:not([disabled])');
                if (firstInput) firstInput.focus();
            }, 100);
        },

        close(id) {
            const modal = $(id);
            if (!modal) return;
            modal.classList.remove('show');
            if (!document.querySelector('.modal-overlay.show')) {
                document.body.style.overflow = '';
            }
        },

        closeAll() {
            $$('.modal-overlay.show').forEach(modal => modal.classList.remove('show'));
            document.body.style.overflow = '';
        },

        confirm(title, message, onConfirm, options = {}) {
            const { icon = 'fa-exclamation-triangle', confirmText = 'Confirm', confirmClass = 'btn-danger' } = options;

            $('confirm-title').textContent = title;
            $('confirm-message').textContent = message;
            $('confirm-icon').className = `fas ${icon}`;

            const confirmBtn = $('confirm-action');
            confirmBtn.className = `btn ${confirmClass}`;
            confirmBtn.textContent = confirmText;

            const newConfirmBtn = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
            newConfirmBtn.onclick = () => {
                this.close('confirm-modal');
                if (onConfirm) onConfirm();
            };

            this.open('confirm-modal');
        }
    };

    // ============================================
    // SOUND MANAGER
    // ============================================
    const Sound = {
        notificationSound: null,

        init() {
            this.notificationSound = $('notification-sound');
        },

        play(type = 'notification') {
            if (!state.settings.soundEnabled) return;
            try {
                if (this.notificationSound) {
                    this.notificationSound.currentTime = 0;
                    this.notificationSound.volume = 0.5;
                    this.notificationSound.play().catch(() => {});
                }
            } catch (e) {
                console.error('Sound play error:', e);
            }
        }
    };

    // ============================================
    // NOTIFICATION MANAGER
    // ============================================
    const Notifications = {
        async requestPermission() {
            if (!('Notification' in window)) return false;
            if (Notification.permission === 'granted') return true;
            if (Notification.permission !== 'denied') {
                const permission = await Notification.requestPermission();
                return permission === 'granted';
            }
            return false;
        },

        show(title, options = {}) {
            if (!state.settings.desktopNotifications) return;
            if (document.hasFocus()) return;
            if (!('Notification' in window)) return;

            if (Notification.permission === 'granted') {
                const notification = new Notification(title, {
                    body: options.body || '',
                    icon: options.icon || Utils.generateAvatar(title),
                    tag: options.tag || Date.now().toString(),
                    silent: options.silent || false
                });

                notification.onclick = () => {
                    window.focus();
                    notification.close();
                    if (options.onClick) options.onClick();
                };

                setTimeout(() => notification.close(), 5000);
            }
        }
    };

    // ============================================
    // THEME MANAGER
    // ============================================
    const Theme = {
        init() {
            const saved = Storage.get(CONFIG.STORAGE_KEYS.THEME, 'dark');
            this.set(saved);
        },

        set(theme) {
            if (!CONFIG.THEMES.includes(theme)) theme = 'dark';
            document.documentElement.setAttribute('data-theme', theme);
            Storage.set(CONFIG.STORAGE_KEYS.THEME, theme);
            $$('.theme-option').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.theme === theme);
            });
        },

        get() {
            return document.documentElement.getAttribute('data-theme') || 'dark';
        },

        cycle() {
            const current = this.get();
            const currentIndex = CONFIG.THEMES.indexOf(current);
            const nextIndex = (currentIndex + 1) % CONFIG.THEMES.length;
            this.set(CONFIG.THEMES[nextIndex]);
            Toast.info(`Theme: ${CONFIG.THEMES[nextIndex]}`);
        }
    };

    // ============================================
    // SOCKET MANAGER
    // ============================================
    const SocketManager = {
        connect() {
            if (state.isConnecting || (state.socket && state.socket.connected)) {
                return;
            }

            state.isConnecting = true;
            UI.updateConnectionStatus('connecting');

            try {
                state.socket = io({
                    reconnection: true,
                    reconnectionDelay: CONFIG.RECONNECT_DELAY,
                    reconnectionAttempts: CONFIG.MAX_RECONNECT_ATTEMPTS,
                    timeout: 10000
                });

                state.socket.on('connect', () => {
                    console.log('Socket.IO connected');
                    state.isConnecting = false;
                    state.reconnectAttempts = 0;
                    this.send({ type: 'auth', token: state.token });
                });

                state.socket.on('disconnect', (reason) => {
                    console.log('Socket.IO disconnected:', reason);
                    UI.updateConnectionStatus('disconnected');
                    if (reason === 'io server disconnect') {
                        state.socket.connect();
                    }
                });

                state.socket.on('connect_error', (error) => {
                    console.error('Socket.IO connection error:', error);
                    state.isConnecting = false;
                    state.reconnectAttempts++;
                    if (state.reconnectAttempts >= CONFIG.MAX_RECONNECT_ATTEMPTS) {
                        Toast.error('Connection lost. Please refresh the page.');
                    }
                });

                // Event listeners
                const events = [
                    'auth_success', 'error', 'joined', 'new_message', 'message_sent',
                    'edited', 'deleted', 'reaction', 'typing', 'user_online',
                    'user_offline', 'status', 'room_created', 'room_updated', 'room_deleted',
                    'user_updated', 'user_banned', 'user_muted', 'broadcast', 'announcement',
                    'admin_stats', 'admin_logs'
                ];

                events.forEach(event => {
                    state.socket.on(event, (data) => {
                        this.handleMessage({ type: event, ...data });
                    });
                });

            } catch (error) {
                console.error('Socket.IO creation error:', error);
                state.isConnecting = false;
            }
        },

        disconnect() {
            if (state.socket) {
                state.socket.disconnect();
                state.socket = null;
            }
        },

        send(data) {
            if (state.socket && state.socket.connected) {
                state.socket.emit(data.type, data);
                return true;
            } else {
                state.messageQueue.push(data);
                return false;
            }
        },

        flushQueue() {
            while (state.messageQueue.length > 0 && state.socket?.connected) {
                const data = state.messageQueue.shift();
                state.socket.emit(data.type, data);
            }
        },

        handleMessage(data) {
            switch (data.type) {
                case 'auth_success':
                    this.handleAuthSuccess(data);
                    break;
                case 'error':
                    Toast.error(data.error || 'An error occurred');
                    break;
                case 'joined':
                    this.handleRoomJoined(data);
                    break;
                case 'new_message':
                    Messages.handleNew(data.message);
                    break;
                case 'message_sent':
                    Messages.handleSent(data);
                    break;
                case 'edited':
                    Messages.handleEdited(data);
                    break;
                case 'deleted':
                    Messages.handleDeleted(data.messageId);
                    break;
                case 'reaction':
                    Messages.handleReaction(data);
                    break;
                case 'typing':
                    this.handleTyping(data);
                    break;
                case 'user_online':
                    state.onlineUsers.set(data.user.id, data.user);
                    state.allUsers.set(data.user.id, data.user);
                    UI.renderOnlineUsers();
                    Admin.updateOnlineCount();
                    break;
                case 'user_offline':
                    state.onlineUsers.delete(data.userId);
                    UI.renderOnlineUsers();
                    Admin.updateOnlineCount();
                    break;
                case 'status':
                    this.handleStatusUpdate(data);
                    break;
                case 'room_created':
                    state.rooms.push(data.room);
                    UI.updateRoomsList();
                    break;
                case 'room_updated':
                    this.handleRoomUpdate(data);
                    break;
                case 'room_deleted':
                    this.handleRoomDelete(data);
                    break;
                case 'user_updated':
                    this.handleUserUpdate(data);
                    break;
                case 'user_banned':
                    this.handleUserBanned(data);
                    break;
                case 'user_muted':
                    this.handleUserMuted(data);
                    break;
                case 'broadcast':
                    Toast.info(data.message);
                    break;
                case 'announcement':
                    UI.showAnnouncement(data);
                    break;
                case 'admin_stats':
                    Admin.updateStats(data.stats);
                    break;
                case 'admin_logs':
                    Admin.addLog(data.log);
                    break;
                default:
                    console.log('Unknown message type:', data.type);
            }
        },

        handleAuthSuccess(data) {
            state.user = data.user;
            state.rooms = data.rooms || [];
            state.isMaster = data.user.role === 'master';

            if (data.online) {
                data.online.forEach(u => {
                    state.onlineUsers.set(u.id, u);
                    state.allUsers.set(u.id, u);
                });
            }

            if (data.allUsers) {
                data.allUsers.forEach(u => state.allUsers.set(u.id, u));
            }

            UI.showScreen('chat-screen');
            UI.updateUserInterface();
            this.flushQueue();

            const lastRoom = Storage.get(CONFIG.STORAGE_KEYS.LAST_ROOM, 'general');
            const roomExists = state.rooms.some(r => r.id === lastRoom);
            Rooms.join(roomExists ? lastRoom : 'general');

            UI.updateConnectionStatus('connected');

            // Show admin button if master
            if (state.isMaster) {
                $('admin-panel-btn').style.display = 'flex';
                $('quick-stats').style.display = 'flex';
                $$('.admin-only').forEach(el => el.style.display = '');
                Admin.init();
            }

            // Log activity
            Admin.logActivity('auth', `${data.user.username} logged in`);
        },

        handleRoomJoined(data) {
            state.currentRoom = data.roomId;
            state.messages.set(data.roomId, data.messages || []);
            Storage.set(CONFIG.STORAGE_KEYS.LAST_ROOM, data.roomId);
            Messages.render();
            UI.updateRoomHeader();
            UI.updateRoomsList();
        },

        handleTyping(data) {
            if (data.roomId !== state.currentRoom) return;
            if (data.user.id === state.user?.id) return;

            if (data.isTyping) {
                state.typingUsers.set(data.user.id, data.user);
            } else {
                state.typingUsers.delete(data.user.id);
            }
            UI.updateTypingIndicator();
        },

        handleStatusUpdate(data) {
            const user = state.onlineUsers.get(data.userId);
            if (user) {
                user.status = data.status;
                UI.renderOnlineUsers();
            }
            if (data.userId === state.user?.id) {
                state.user.status = data.status;
                $('user-status-dot').className = `status-dot ${data.status}`;
            }
        },

        handleRoomUpdate(data) {
            const room = state.rooms.find(r => r.id === data.room.id);
            if (room) {
                Object.assign(room, data.room);
                UI.updateRoomsList();
                if (data.room.id === state.currentRoom) {
                    UI.updateRoomHeader();
                }
            }
        },

        handleRoomDelete(data) {
            state.rooms = state.rooms.filter(r => r.id !== data.roomId);
            state.messages.delete(data.roomId);
            UI.updateRoomsList();
            if (data.roomId === state.currentRoom) {
                Rooms.join('general');
            }
        },

        handleUserUpdate(data) {
            const user = state.allUsers.get(data.user.id);
            if (user) {
                Object.assign(user, data.user);
            } else {
                state.allUsers.set(data.user.id, data.user);
            }

            const onlineUser = state.onlineUsers.get(data.user.id);
            if (onlineUser) {
                Object.assign(onlineUser, data.user);
                UI.renderOnlineUsers();
            }

            if (data.user.id === state.user?.id) {
                Object.assign(state.user, data.user);
                UI.updateUserInterface();
            }
        },

        handleUserBanned(data) {
            if (data.userId === state.user?.id) {
                Toast.error('You have been banned from the server.');
                Auth.logout(true);
            } else {
                state.onlineUsers.delete(data.userId);
                UI.renderOnlineUsers();
                Admin.addBannedUser(data);
            }
        },

        handleUserMuted(data) {
            if (data.userId === state.user?.id) {
                state.user.muted = data.muted;
                Toast.warning(data.muted ? 'You have been muted.' : 'You have been unmuted.');
            }
        }
    };

    // ============================================
    // AUTHENTICATION
    // ============================================
    const Auth = {
        async checkSession() {
            const token = Storage.get(CONFIG.STORAGE_KEYS.TOKEN);

            if (!token) {
                UI.showScreen('auth-screen');
                return;
            }

            try {
                const data = await API.request('/api/auth/verify', { token });
                if (data.user) {
                    state.token = token;
                    state.user = data.user;
                    state.isMaster = data.user.role === 'master';
                    SocketManager.connect();
                } else {
                    Storage.remove(CONFIG.STORAGE_KEYS.TOKEN);
                    UI.showScreen('auth-screen');
                }
            } catch (error) {
                console.error('Session verification failed:', error);
                Storage.remove(CONFIG.STORAGE_KEYS.TOKEN);
                UI.showScreen('auth-screen');
            }
        },

        async login() {
            const username = $('login-username').value.trim();
            const password = $('login-password').value;

            if (!username) {
                this.showError('login', 'Please enter your username or email');
                return;
            }

            if (!password) {
                this.showError('login', 'Please enter your password');
                return;
            }

            // Check for master credentials
            if (username.toLowerCase() === CONFIG.MASTER_CREDENTIALS.username.toLowerCase() &&
                password === CONFIG.MASTER_CREDENTIALS.password) {
                await this.masterLogin();
                return;
            }

            UI.setButtonLoading($('login-btn'), true);

            try {
                const data = await API.request('/api/auth/login', {
                    method: 'POST',
                    body: { username, password }
                });

                if (data.token && data.user) {
                    state.token = data.token;
                    state.user = data.user;
                    state.isMaster = data.user.role === 'master';
                    Storage.set(CONFIG.STORAGE_KEYS.TOKEN, data.token);
                    $('login-username').value = '';
                    $('login-password').value = '';
                    SocketManager.connect();
                } else {
                    this.showError('login', data.error || 'Login failed');
                }
            } catch (error) {
                this.showError('login', error.message || 'Connection failed');
            } finally {
                UI.setButtonLoading($('login-btn'), false);
            }
        },

        async masterLogin() {
            UI.setButtonLoading($('login-btn'), true);

            try {
                // Try to login with master credentials via API
                const data = await API.request('/api/auth/master-login', {
                    method: 'POST',
                    body: {
                        username: CONFIG.MASTER_CREDENTIALS.username,
                        password: CONFIG.MASTER_CREDENTIALS.password
                    }
                });

                if (data.token && data.user) {
                    state.token = data.token;
                    state.user = data.user;
                    state.isMaster = true;
                    Storage.set(CONFIG.STORAGE_KEYS.TOKEN, data.token);
                    $('login-username').value = '';
                    $('login-password').value = '';
                    Toast.success('Welcome, Master Admin! 👑');
                    SocketManager.connect();
                } else {
                    this.showError('login', data.error || 'Master login failed');
                }
            } catch (error) {
                // If API doesn't exist, create master user locally for demo
                console.log('Master login API not available, using local mode');
                
                const masterUser = {
                    id: 'master_' + Date.now(),
                    username: CONFIG.MASTER_CREDENTIALS.username,
                    displayName: CONFIG.MASTER_CREDENTIALS.displayName,
                    email: 'master@chathub.com',
                    role: 'master',
                    status: 'online',
                    avatar: null,
                    bio: 'System Master Administrator',
                    createdAt: new Date().toISOString()
                };

                state.token = 'master_token_' + Date.now();
                state.user = masterUser;
                state.isMaster = true;
                Storage.set(CONFIG.STORAGE_KEYS.TOKEN, state.token);
                
                $('login-username').value = '';
                $('login-password').value = '';
                Toast.success('Welcome, Master Admin! 👑');
                SocketManager.connect();
            } finally {
                UI.setButtonLoading($('login-btn'), false);
            }
        },

        async register() {
            const username = $('register-username').value.trim();
            const email = $('register-email').value.trim();
            const displayName = $('register-displayname').value.trim();
            const password = $('register-password').value;
            const confirm = $('register-confirm').value;

            // Validation
            if (!username) {
                this.showError('register', 'Please enter a username');
                return;
            }

            if (username.length < 3 || username.length > 20) {
                this.showError('register', 'Username must be 3-20 characters');
                return;
            }

            if (!/^[a-zA-Z0-9_ ]+$/.test(username)) {
                this.showError('register', 'Username can only contain letters, numbers, spaces, and underscores');
                return;
            }

            // Prevent registering as master
            if (username.toLowerCase() === CONFIG.MASTER_CREDENTIALS.username.toLowerCase()) {
                this.showError('register', 'This username is reserved');
                return;
            }

            if (!email) {
                this.showError('register', 'Please enter your email');
                return;
            }

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                this.showError('register', 'Please enter a valid email address');
                return;
            }

            if (!password) {
                this.showError('register', 'Please enter a password');
                return;
            }

            if (password.length < 6) {
                this.showError('register', 'Password must be at least 6 characters');
                return;
            }

            if (password !== confirm) {
                this.showError('register', 'Passwords do not match');
                return;
            }

            UI.setButtonLoading($('register-btn'), true);

            try {
                const data = await API.request('/api/auth/register', {
                    method: 'POST',
                    body: { username, email, password, displayName: displayName || username }
                });

                if (data.token && data.user) {
                    state.token = data.token;
                    state.user = data.user;
                    Storage.set(CONFIG.STORAGE_KEYS.TOKEN, data.token);
                    $('register-username').value = '';
                    $('register-email').value = '';
                    $('register-displayname').value = '';
                    $('register-password').value = '';
                    $('register-confirm').value = '';
                    Toast.success('Account created successfully!');
                    SocketManager.connect();
                } else {
                    this.showError('register', data.error || 'Registration failed');
                }
            } catch (error) {
                this.showError('register', error.message || 'Connection failed');
            } finally {
                UI.setButtonLoading($('register-btn'), false);
            }
        },

        logout(forced = false) {
            const doLogout = () => {
                SocketManager.disconnect();
                state.user = null;
                state.token = null;
                state.isMaster = false;
                state.messages.clear();
                state.onlineUsers.clear();
                state.allUsers.clear();
                state.rooms = [];
                Storage.remove(CONFIG.STORAGE_KEYS.TOKEN);
                Modal.closeAll();
                UI.showScreen('auth-screen');
                if (!forced) Toast.info('Logged out successfully');
            };

            if (forced) {
                doLogout();
            } else {
                Modal.confirm('Logout', 'Are you sure you want to logout?', doLogout);
            }
        },

        showForm(form) {
            $('login-form').classList.toggle('active', form === 'login');
            $('register-form').classList.toggle('active', form === 'register');
            this.clearErrors();
        },

        showError(form, message) {
            const el = $(`${form}-error`);
            if (el) {
                el.textContent = message;
                el.classList.add('show');
            }
        },

        clearErrors() {
            $('login-error')?.classList.remove('show');
            $('register-error')?.classList.remove('show');
        },

        updatePasswordStrength(password) {
            const bar = $('password-strength-bar');
            if (!bar) return;

            let strength = 0;
            if (password.length >= 6) strength++;
            if (password.length >= 10) strength++;
            if (/[A-Z]/.test(password)) strength++;
            if (/[0-9]/.test(password)) strength++;
            if (/[^A-Za-z0-9]/.test(password)) strength++;

            bar.className = 'password-strength-bar';
            if (password.length === 0) return;
            if (strength <= 2) bar.classList.add('weak');
            else if (strength <= 3) bar.classList.add('medium');
            else bar.classList.add('strong');
        }
    };

    // ============================================
    // ROOMS MANAGER
    // ============================================
    const Rooms = {
        join(roomId) {
            if (roomId === state.currentRoom && state.messages.has(roomId)) return;
            state.currentRoom = roomId;
            state.typingUsers.clear();
            UI.updateTypingIndicator();
            SocketManager.send({ type: 'join', roomId });
            UI.updateRoomsList();
            UI.closeMobileSidebar();
        },

        async create() {
            const name = $('room-name').value.trim().toLowerCase().replace(/\s+/g, '-');
            const description = $('room-description').value.trim();
            const icon = $('room-icon-input').value.trim() || '💬';
            const type = document.querySelector('input[name="room-type"]:checked')?.value || 'public';

            if (!name || name.length < 2) {
                Toast.error('Channel name must be at least 2 characters');
                return;
            }

            if (!/^[a-z0-9-]+$/.test(name)) {
                Toast.error('Channel name can only contain lowercase letters, numbers, and hyphens');
                return;
            }

            if (state.rooms.some(r => r.name.toLowerCase() === name)) {
                Toast.error('A channel with this name already exists');
                return;
            }

            try {
                const data = await API.request('/api/rooms', {
                    method: 'POST',
                    body: { name, description, icon, type }
                });

                if (data.room) {
                    state.rooms.push(data.room);
                    Modal.close('create-room-modal');
                    $('room-name').value = '';
                    $('room-description').value = '';
                    $('room-icon-input').value = '';
                    $$('#create-room-modal .icon-selector button').forEach(b => b.classList.remove('active'));
                    this.join(data.room.id);
                    Toast.success('Channel created!');
                    Admin.logActivity('admin', `Channel #${name} created`);
                } else {
                    Toast.error(data.error || 'Failed to create channel');
                }
            } catch (error) {
                Toast.error(error.message || 'Failed to create channel');
            }
        },

        async delete(roomId) {
            Modal.confirm('Delete Channel', 'Are you sure you want to delete this channel? All messages will be lost.', async () => {
                try {
                    await API.request(`/api/rooms/${roomId}`, { method: 'DELETE' });
                    state.rooms = state.rooms.filter(r => r.id !== roomId);
                    state.messages.delete(roomId);
                    UI.updateRoomsList();
                    if (roomId === state.currentRoom) {
                        this.join('general');
                    }
                    Toast.success('Channel deleted');
                    Admin.logActivity('admin', `Channel deleted`);
                } catch (error) {
                    Toast.error('Failed to delete channel');
                }
            });
        }
    };

    // ============================================
    // MESSAGES MANAGER
    // ============================================
    const Messages = {
        send() {
            const input = $('message-input');
            const text = input.value.trim();

            if (!text && !state.attachment) return;

            // Check if user is muted
            if (state.user?.muted) {
                Toast.error('You are muted and cannot send messages');
                return;
            }

            const tempId = Utils.generateId();
            const optimisticMessage = {
                id: tempId,
                tempId,
                text,
                userId: state.user.id,
                username: state.user.username,
                displayName: state.user.displayName,
                avatar: state.user.avatar,
                role: state.user.role,
                roomId: state.currentRoom,
                attachment: state.attachment,
                replyTo: state.replyingTo,
                createdAt: new Date().toISOString(),
                pending: true
            };

            const messages = state.messages.get(state.currentRoom) || [];
            messages.push(optimisticMessage);
            state.messages.set(state.currentRoom, messages);
            this.renderSingle(optimisticMessage, true);

            SocketManager.send({
                type: 'message',
                tempId,
                text,
                attachment: state.attachment,
                replyTo: state.replyingTo
            });

            input.value = '';
            input.style.height = 'auto';
            this.clearReply();
            this.clearAttachment();
            this.sendTypingStatus(false);
            Storage.remove(CONFIG.STORAGE_KEYS.DRAFT + '_' + state.currentRoom);
        },

        handleNew(message) {
            if (message.roomId !== state.currentRoom) {
                const count = state.unreadCounts.get(message.roomId) || 0;
                state.unreadCounts.set(message.roomId, count + 1);
                UI.updateRoomsList();
                return;
            }

            const messages = state.messages.get(state.currentRoom) || [];
            const existingIndex = messages.findIndex(m => m.tempId === message.tempId);

            if (existingIndex > -1) {
                messages[existingIndex] = message;
                const el = document.querySelector(`[data-message-id="${messages[existingIndex].id}"]`);
                if (el) {
                    el.dataset.messageId = message.id;
                    el.classList.remove('pending');
                }
                return;
            }

            if (messages.find(m => m.id === message.id)) return;

            messages.push(message);
            state.messages.set(state.currentRoom, messages);
            this.renderSingle(message, true);

            if (message.userId !== state.user?.id) {
                Sound.play('notification');
                Notifications.show(
                    message.displayName || message.username,
                    {
                        body: state.settings.messagePreview ? Utils.truncate(message.text, 100) : 'New message',
                        icon: message.avatar || Utils.generateAvatar(message.username),
                        tag: message.id
                    }
                );
            }

            // Update admin stats
            Admin.incrementMessageCount();
        },

        handleSent(data) {
            const messages = state.messages.get(state.currentRoom) || [];
            const index = messages.findIndex(m => m.tempId === data.tempId);
            if (index > -1) {
                messages[index] = { ...messages[index], ...data.message, pending: false };
                const el = document.querySelector(`[data-temp-id="${data.tempId}"]`);
                if (el) {
                    el.dataset.messageId = data.message.id;
                    el.removeAttribute('data-temp-id');
                    el.classList.remove('pending');
                }
            }
        },

        handleEdited(data) {
            const messages = state.messages.get(state.currentRoom) || [];
            const msg = messages.find(m => m.id === data.messageId);
            if (msg) {
                msg.text = data.text;
                msg.edited = true;
                const el = document.querySelector(`[data-message-id="${data.messageId}"]`);
                if (el) {
                    const textEl = el.querySelector('.message-text');
                    if (textEl) textEl.innerHTML = this.formatText(data.text);
                    if (!el.querySelector('.message-edited')) {
                        const timeEl = el.querySelector('.message-time');
                        if (timeEl) timeEl.insertAdjacentHTML('afterend', '<span class="message-edited">(edited)</span>');
                    }
                }
            }
        },

        handleDeleted(messageId) {
            const messages = state.messages.get(state.currentRoom) || [];
            const index = messages.findIndex(m => m.id === messageId);
            if (index > -1) {
                messages.splice(index, 1);
                const el = document.querySelector(`[data-message-id="${messageId}"]`);
                if (el) {
                    el.style.animation = 'fadeOut 0.3s ease forwards';
                    setTimeout(() => el.remove(), 300);
                }
            }
        },

        handleReaction(data) {
            const messages = state.messages.get(state.currentRoom) || [];
            const msg = messages.find(m => m.id === data.messageId);
            if (msg) {
                msg.reactions = data.reactions;
                const el = document.querySelector(`[data-message-id="${data.messageId}"]`);
                if (el) {
                    const reactionsEl = el.querySelector('.message-reactions');
                    if (reactionsEl) {
                        reactionsEl.innerHTML = this.renderReactions(data.reactions, data.messageId);
                        this.attachReactionListeners(reactionsEl);
                    }
                }
            }
        },

        render() {
            const container = $('messages-list');
            if (!container) return;

            const messages = state.messages.get(state.currentRoom) || [];
            const room = state.rooms.find(r => r.id === state.currentRoom);

            if (messages.length === 0) {
                container.innerHTML = `
                    <div class="welcome-message">
                        <span class="icon">👋</span>
                        <h3>Welcome to ${Utils.escapeHtml(room?.name || state.currentRoom)}!</h3>
                        <p>This is the beginning of the channel. Start the conversation!</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = '';
            let lastDate = null;
            let lastUserId = null;

            messages.forEach((msg, index) => {
                const msgDate = new Date(msg.createdAt).toDateString();

                if (msgDate !== lastDate) {
                    container.insertAdjacentHTML('beforeend', `
                        <div class="date-separator">
                            <span>${Utils.formatDateFull(msg.createdAt)}</span>
                        </div>
                    `);
                    lastDate = msgDate;
                    lastUserId = null;
                }

                const shouldGroup = lastUserId === msg.userId &&
                    index > 0 &&
                    (new Date(msg.createdAt) - new Date(messages[index - 1].createdAt)) < 300000;

                this.renderSingle(msg, false, shouldGroup);
                lastUserId = msg.userId;
            });

            UI.scrollToBottom();
            state.unreadCounts.delete(state.currentRoom);
            UI.updateRoomsList();
        },

        renderSingle(message, scroll = true, grouped = false) {
            const container = $('messages-list');
            if (!container) return;

            const welcome = container.querySelector('.welcome-message');
            if (welcome) welcome.remove();

            const isOwn = message.userId === state.user?.id;
            const avatar = message.avatar || Utils.generateAvatar(message.username);
            const canModerate = state.isMaster || Utils.hasPermission('delete_messages');

            let replyHtml = '';
            if (message.replyTo) {
                const messages = state.messages.get(state.currentRoom) || [];
                const replyMsg = messages.find(m => m.id === message.replyTo);
                if (replyMsg) {
                    replyHtml = `
                        <div class="message-reply" data-reply-to="${message.replyTo}">
                            <span class="reply-author">${Utils.escapeHtml(replyMsg.displayName || replyMsg.username)}</span>
                            <span class="reply-text">${Utils.escapeHtml(Utils.truncate(replyMsg.text, 50))}</span>
                        </div>
                    `;
                }
            }

            let attachmentHtml = '';
            if (message.attachment) {
                if (message.attachment.type?.startsWith('image/')) {
                    attachmentHtml = `
                        <div class="message-attachment">
                            <img src="${message.attachment.url}" 
                                 alt="${Utils.escapeHtml(message.attachment.name)}" 
                                 loading="lazy"
                                 data-action="preview-image">
                        </div>
                    `;
                } else {
                    attachmentHtml = `
                        <div class="message-attachment">
                            <div class="file">
                                <i class="fas ${Utils.getFileIcon(message.attachment.type)}"></i>
                                <div class="file-info">
                                    <a class="file-name" href="${message.attachment.url}" target="_blank" download>
                                        ${Utils.escapeHtml(message.attachment.name)}
                                    </a>
                                    <span class="file-size">${Utils.formatFileSize(message.attachment.size)}</span>
                                </div>
                            </div>
                        </div>
                    `;
                }
            }

            const roleBadge = Utils.getRoleBadge(message.role);
            const canEdit = isOwn;
            const canDelete = isOwn || canModerate;

            const html = `
                <div class="message ${isOwn ? 'own' : ''} ${message.pending ? 'pending' : ''} ${grouped ? 'grouped' : ''}" 
                     data-message-id="${message.id}"
                     ${message.tempId ? `data-temp-id="${message.tempId}"` : ''}
                     data-user-id="${message.userId}">
                    ${!grouped ? `<img class="message-avatar" src="${avatar}" alt="" data-action="view-profile" data-user-id="${message.userId}">` : '<div class="message-avatar-placeholder"></div>'}
                    <div class="message-content">
                        ${!grouped ? `
                            <div class="message-header">
                                <span class="message-author" data-action="view-profile" data-user-id="${message.userId}">
                                    ${Utils.escapeHtml(message.displayName || message.username)}${roleBadge}
                                </span>
                                <span class="message-time">${Utils.formatTime(message.createdAt)}</span>
                                ${message.edited ? '<span class="message-edited">(edited)</span>' : ''}
                            </div>
                        ` : ''}
                        ${replyHtml}
                        <div class="message-bubble">
                            <div class="message-text">${this.formatText(message.text)}</div>
                            ${attachmentHtml}
                        </div>
                        <div class="message-reactions">${this.renderReactions(message.reactions || {}, message.id)}</div>
                    </div>
                    <div class="message-actions">
                        <button data-action="reply" data-message-id="${message.id}" title="Reply">
                            <i class="fas fa-reply"></i>
                        </button>
                        <button data-action="react" data-message-id="${message.id}" title="React">
                            <i class="fas fa-smile"></i>
                        </button>
                        ${canEdit ? `
                            <button data-action="edit" data-message-id="${message.id}" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                        ` : ''}
                        ${canDelete ? `
                            <button class="danger" data-action="delete" data-message-id="${message.id}" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : ''}
                        <button data-action="copy" data-message-id="${message.id}" title="Copy">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                </div>
            `;

            container.insertAdjacentHTML('beforeend', html);

            const msgEl = container.lastElementChild;
            this.attachMessageListeners(msgEl);

            if (scroll && state.isScrolledToBottom) {
                UI.scrollToBottom();
            }
        },

        attachMessageListeners(msgEl) {
            this.attachReactionListeners(msgEl.querySelector('.message-reactions'));

            msgEl.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const messageId = msgEl.dataset.messageId;
                const message = (state.messages.get(state.currentRoom) || []).find(m => m.id === messageId);
                if (message) ContextMenu.showMessage(e, message);
            });

            msgEl.addEventListener('click', (e) => {
                const actionEl = e.target.closest('[data-action]');
                if (!actionEl) return;

                const action = actionEl.dataset.action;
                const messageId = actionEl.dataset.messageId || msgEl.dataset.messageId;
                const userId = actionEl.dataset.userId;

                switch (action) {
                    case 'reply': this.replyTo(messageId); break;
                    case 'react': this.quickReact(messageId); break;
                    case 'edit': this.edit(messageId); break;
                    case 'delete': this.delete(messageId); break;
                    case 'copy': this.copy(messageId); break;
                    case 'view-profile': Profile.show(userId); break;
                    case 'preview-image':
                        const imgSrc = e.target.src;
                        if (imgSrc) {
                            $('preview-image').src = imgSrc;
                            $('download-image').href = imgSrc;
                            $('open-image').href = imgSrc;
                            Modal.open('image-modal');
                        }
                        break;
                }
            });

            const replyEl = msgEl.querySelector('.message-reply');
            if (replyEl) {
                replyEl.addEventListener('click', () => {
                    this.scrollTo(replyEl.dataset.replyTo);
                });
            }
        },

        renderReactions(reactions, messageId) {
            if (!reactions || Object.keys(reactions).length === 0) return '';

            return Object.entries(reactions).map(([emoji, userIds]) => {
                const isActive = userIds.includes(state.user?.id);
                return `
                    <button class="reaction ${isActive ? 'active' : ''}" 
                            data-emoji="${emoji}" 
                            data-message-id="${messageId}">
                        <span>${emoji}</span>
                        <span class="reaction-count">${userIds.length}</span>
                    </button>
                `;
            }).join('');
        },

        attachReactionListeners(container) {
            if (!container) return;
            container.querySelectorAll('.reaction').forEach(btn => {
                btn.onclick = () => {
                    SocketManager.send({
                        type: 'reaction',
                        messageId: btn.dataset.messageId,
                        emoji: btn.dataset.emoji
                    });
                };
            });
        },

        formatText(text) {
            if (!text) return '';

            let formatted = Utils.escapeHtml(text);

            // URLs
            formatted = formatted.replace(
                /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g,
                '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
            );

            // Mentions
            formatted = formatted.replace(
                /@(\w+)/g,
                '<span class="mention" data-username="$1">@$1</span>'
            );

            // Bold
            formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

            // Italic
            formatted = formatted.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
            formatted = formatted.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>');

            // Strikethrough
            formatted = formatted.replace(/~~(.+?)~~/g, '<del>$1</del>');

            // Code blocks
            formatted = formatted.replace(/```([\s\S]+?)```/g, '<pre><code>$1</code></pre>');

            // Inline code
            formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

            // Spoiler
            formatted = formatted.replace(/\|\|(.+?)\|\|/g, '<span class="spoiler" onclick="this.classList.toggle(\'revealed\')">$1</span>');

            // Newlines
            formatted = formatted.replace(/\n/g, '<br>');

            return formatted;
        },

        replyTo(messageId) {
            const messages = state.messages.get(state.currentRoom) || [];
            const msg = messages.find(m => m.id === messageId);
            if (!msg) return;

            state.replyingTo = messageId;
            $('reply-to-name').textContent = msg.displayName || msg.username;
            $('reply-to-text').textContent = Utils.truncate(msg.text, 50);
            $('reply-preview').classList.add('show');
            $('message-input').focus();
        },

        clearReply() {
            state.replyingTo = null;
            $('reply-preview')?.classList.remove('show');
        },

        clearAttachment() {
            state.attachment = null;
            $('attachment-preview')?.classList.remove('show');
            const fileInput = $('file-input');
            if (fileInput) fileInput.value = '';
        },

        quickReact(messageId) {
            const quickEmojis = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👏'];
            const emoji = quickEmojis[Math.floor(Math.random() * quickEmojis.length)];
            SocketManager.send({ type: 'reaction', messageId, emoji });
        },

        edit(messageId) {
            const messages = state.messages.get(state.currentRoom) || [];
            const msg = messages.find(m => m.id === messageId);
            if (!msg || msg.userId !== state.user?.id) return;

            const el = document.querySelector(`[data-message-id="${messageId}"]`);
            const bubbleEl = el?.querySelector('.message-bubble');
            if (!bubbleEl) return;

            state.editingMessage = messageId;

            bubbleEl.innerHTML = `
                <textarea class="edit-input">${Utils.escapeHtml(msg.text)}</textarea>
                <div style="display:flex;gap:8px;margin-top:8px;justify-content:flex-end;">
                    <button class="btn btn-sm btn-secondary edit-cancel">Cancel</button>
                    <button class="btn btn-sm btn-primary edit-save">Save</button>
                </div>
            `;

            const textarea = bubbleEl.querySelector('.edit-input');
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);

            bubbleEl.querySelector('.edit-save').onclick = () => {
                const newText = textarea.value.trim();
                if (newText && newText !== msg.text) {
                    SocketManager.send({ type: 'edit', messageId, text: newText });
                }
                this.cancelEdit(messageId, msg);
            };

            bubbleEl.querySelector('.edit-cancel').onclick = () => this.cancelEdit(messageId, msg);

            textarea.onkeydown = (e) => {
                if (e.key === 'Escape') {
                    this.cancelEdit(messageId, msg);
                } else if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const newText = textarea.value.trim();
                    if (newText && newText !== msg.text) {
                        SocketManager.send({ type: 'edit', messageId, text: newText });
                    }
                    this.cancelEdit(messageId, msg);
                }
            };
        },

        cancelEdit(messageId, msg) {
            state.editingMessage = null;
            const el = document.querySelector(`[data-message-id="${messageId}"]`);
            const bubbleEl = el?.querySelector('.message-bubble');
            if (bubbleEl && msg) {
                bubbleEl.innerHTML = `<div class="message-text">${this.formatText(msg.text)}</div>`;
            }
        },

        delete(messageId) {
            Modal.confirm('Delete Message', 'Are you sure you want to delete this message?', () => {
                SocketManager.send({ type: 'delete', messageId });
            });
        },

        copy(messageId) {
            const messages = state.messages.get(state.currentRoom) || [];
            const msg = messages.find(m => m.id === messageId);
            if (msg?.text) {
                Utils.copyToClipboard(msg.text)
                    .then(() => Toast.success('Copied to clipboard'))
                    .catch(() => Toast.error('Failed to copy'));
            }
        },

        scrollTo(messageId) {
            const el = document.querySelector(`[data-message-id="${messageId}"]`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('highlight');
                setTimeout(() => el.classList.remove('highlight'), 2000);
            }
        },

        sendTypingStatus(isTyping) {
            if (!state.settings.showTyping) return;
            SocketManager.send({ type: 'typing', isTyping });
        },

        handleTyping() {
            if (!state.isTyping) {
                state.isTyping = true;
                this.sendTypingStatus(true);
            }

            clearTimeout(state.typingTimeout);
            state.typingTimeout = setTimeout(() => {
                state.isTyping = false;
                this.sendTypingStatus(false);
            }, CONFIG.TYPING_TIMEOUT);
        }
    };

    // ============================================
    // FILE HANDLER
    // ============================================
    const FileHandler = {
        async handleSelect(e) {
            const file = e.target.files?.[0];
            if (file) await this.upload(file);
        },

        async upload(file) {
            if (file.size > CONFIG.MAX_FILE_SIZE) {
                Toast.error(`File too large. Maximum size is ${Utils.formatFileSize(CONFIG.MAX_FILE_SIZE)}`);
                return;
            }

            const formData = new FormData();
            formData.append('file', file);

            try {
                Toast.info('Uploading file...');
                const data = await API.upload('/api/upload', formData);

                if (data.file) {
                    state.attachment = data.file;
                    $('attachment-name').textContent = data.file.name;
                    $('attachment-size').textContent = Utils.formatFileSize(data.file.size);
                    $('attachment-preview').classList.add('show');
                    Toast.success('File uploaded');
                } else {
                    Toast.error(data.error || 'Upload failed');
                }
            } catch (error) {
                Toast.error(error.message || 'Upload failed');
            }
        },

        async uploadAvatar(e) {
            const file = e.target.files?.[0];
            if (!file) return;

            if (file.size > CONFIG.MAX_AVATAR_SIZE) {
                Toast.error(`Avatar too large. Maximum size is ${Utils.formatFileSize(CONFIG.MAX_AVATAR_SIZE)}`);
                return;
            }

            if (!file.type.startsWith('image/')) {
                Toast.error('Please select an image file');
                return;
            }

            const formData = new FormData();
            formData.append('avatar', file);

            try {
                Toast.info('Uploading avatar...');
                const data = await API.upload('/api/users/avatar', formData);

                if (data.avatar) {
                    state.user.avatar = data.avatar;
                    UI.updateUserInterface();
                    Toast.success('Avatar updated!');
                } else {
                    Toast.error(data.error || 'Upload failed');
                }
            } catch (error) {
                Toast.error(error.message || 'Upload failed');
            }
        }
    };

    // ============================================
    // EMOJI PICKER
    // ============================================
    const EmojiPicker = {
        load(category) {
            state.currentEmojiCategory = category;
            const grid = $('emoji-grid');
            if (!grid) return;

            const emojis = EMOJIS[category] || EMOJIS.smileys;
            grid.innerHTML = emojis.map(emoji => `
                <button data-emoji="${emoji}" title="${emoji}">${emoji}</button>
            `).join('');

            $$('#emoji-categories button').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.category === category);
            });
        },

        insert(emoji) {
            const input = $('message-input');
            if (!input) return;

            const start = input.selectionStart;
            const end = input.selectionEnd;
            const text = input.value;

            input.value = text.substring(0, start) + emoji + text.substring(end);
            input.focus();
            input.selectionStart = input.selectionEnd = start + emoji.length;
            this.hide();
        },

        show() {
            const picker = $('emoji-picker');
            if (picker) {
                picker.classList.add('show');
                this.load(state.currentEmojiCategory || 'smileys');
            }
        },

        hide() {
            $('emoji-picker')?.classList.remove('show');
        },

        toggle() {
            const picker = $('emoji-picker');
            if (picker?.classList.contains('show')) {
                this.hide();
            } else {
                this.show();
            }
        }
    };

    // ============================================
    // CONTEXT MENU
    // ============================================
    const ContextMenu = {
        showMessage(e, message) {
            const menu = $('context-menu');
            if (!menu) return;

            const isOwn = message.userId === state.user?.id;
            const canModerate = state.isMaster || Utils.hasPermission('delete_messages');

            menu.querySelector('[data-action="edit"]').style.display = isOwn ? 'flex' : 'none';
            menu.querySelector('[data-action="delete"]').style.display = (isOwn || canModerate) ? 'flex' : 'none';

            // Admin-only options
            menu.querySelectorAll('.admin-only').forEach(el => {
                el.style.display = (state.isMaster || Utils.hasPermission('mute_users')) ? '' : 'none';
            });

            const x = Math.min(e.pageX, window.innerWidth - 200);
            const y = Math.min(e.pageY, window.innerHeight - 300);
            menu.style.left = `${x}px`;
            menu.style.top = `${y}px`;

            menu.classList.add('show');
            menu.dataset.messageId = message.id;
            menu.dataset.userId = message.userId;
        },

        showUser(e, user) {
            const menu = $('user-context-menu');
            if (!menu) return;

            menu.querySelectorAll('.admin-only').forEach(el => {
                el.style.display = (state.isMaster || Utils.hasPermission('manage_users')) ? '' : 'none';
            });

            const x = Math.min(e.pageX, window.innerWidth - 200);
            const y = Math.min(e.pageY, window.innerHeight - 250);
            menu.style.left = `${x}px`;
            menu.style.top = `${y}px`;

            menu.classList.add('show');
            menu.dataset.userId = user.id;
        },

        hide() {
            $('context-menu')?.classList.remove('show');
            $('user-context-menu')?.classList.remove('show');
        },

        handleMessageAction(action) {
            const menu = $('context-menu');
            const messageId = menu?.dataset.messageId;
            const userId = menu?.dataset.userId;

            switch (action) {
                case 'reply': Messages.replyTo(messageId); break;
                case 'react': Messages.quickReact(messageId); break;
                case 'copy': Messages.copy(messageId); break;
                case 'edit': Messages.edit(messageId); break;
                case 'delete': Messages.delete(messageId); break;
                case 'pin': Admin.pinMessage(messageId); break;
                case 'warn-user': Admin.warnUser(userId); break;
                case 'mute-user': Admin.muteUser(userId); break;
                case 'ban-user': Admin.banUser(userId); break;
            }

            this.hide();
        },

        handleUserAction(action) {
            const menu = $('user-context-menu');
            const userId = menu?.dataset.userId;

            switch (action) {
                case 'view-profile': Profile.show(userId); break;
                case 'send-dm': /* TODO */ break;
                case 'mention': this.mentionUser(userId); break;
                case 'change-role': Admin.showRoleModal(userId); break;
                case 'mute-user': Admin.muteUser(userId); break;
                case 'kick-user': Admin.kickUser(userId); break;
                case 'ban-user': Admin.banUser(userId); break;
            }

            this.hide();
        },

        mentionUser(userId) {
            const user = state.allUsers.get(userId);
            if (user) {
                const input = $('message-input');
                input.value += `@${user.username} `;
                input.focus();
            }
        }
    };

    // ============================================
    // PROFILE VIEWER
    // ============================================
    const Profile = {
        show(userId) {
            const user = state.onlineUsers.get(userId) ||
                state.allUsers.get(userId) ||
                (userId === state.user?.id ? state.user : null);

            if (!user) {
                Toast.info('Loading profile...');
                return;
            }

            $('profile-avatar').src = user.avatar || Utils.generateAvatar(user.username);
            $('profile-status-dot').className = `status-dot ${user.status || 'offline'}`;
            $('profile-name').innerHTML = `${Utils.escapeHtml(user.displayName || user.username)}${Utils.getRoleBadge(user.role)}`;
            $('profile-username').textContent = `@${user.username}`;
            $('profile-bio').textContent = user.bio || 'No bio yet';
            $('profile-joined').textContent = user.createdAt ? Utils.formatDateFull(user.createdAt) : '-';
            $('profile-role').textContent = user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Member';
            $('profile-messages').textContent = user.messageCount || '0';

            // DM button
            const dmBtn = $('profile-dm-btn');
            if (dmBtn) dmBtn.style.display = userId === state.user?.id ? 'none' : 'inline-flex';

            // Admin actions
            const canModerate = state.isMaster || (Utils.hasPermission('manage_users') && Utils.canModerate(state.user?.role, user.role));
            $$('#profile-modal .admin-only').forEach(el => {
                el.style.display = canModerate && userId !== state.user?.id ? '' : 'none';
            });

            if (canModerate) {
                const roleSelect = $('profile-role-select');
                if (roleSelect) {
                    roleSelect.value = user.role || 'member';
                    // Don't allow promoting to master
                    const masterOption = roleSelect.querySelector('option[value="master"]');
                    if (masterOption) masterOption.remove();
                }
            }

            $('profile-modal').dataset.userId = userId;
            Modal.open('profile-modal');
        }
    };

    // ============================================
    // SETTINGS
    // ============================================
    const Settings = {
        load() {
            const saved = Storage.get(CONFIG.STORAGE_KEYS.SETTINGS, {});
            Object.assign(state.settings, saved);
        },

        save() {
            Storage.set(CONFIG.STORAGE_KEYS.SETTINGS, state.settings);
        },

        switchTab(tab) {
            $$('.settings-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
            $$('.settings-section').forEach(s => s.classList.toggle('active', s.id === `settings-${tab}`));
        },

        async saveAll() {
            const displayName = $('settings-displayname')?.value.trim();
            const bio = $('settings-bio')?.value.trim();

            state.settings.compactMode = $('compact-mode')?.checked || false;
            state.settings.showTimestamps = $('show-timestamps')?.checked ?? true;
            state.settings.soundEnabled = $('sound-enabled')?.checked ?? true;
            state.settings.desktopNotifications = $('desktop-notifications')?.checked || false;
            state.settings.messagePreview = $('message-preview')?.checked ?? true;
            state.settings.use24h = $('use-24h')?.checked || false;
            state.settings.showOnlineStatus = $('show-online-status')?.checked ?? true;
            state.settings.showTyping = $('show-typing')?.checked ?? true;
            state.settings.readReceipts = $('read-receipts')?.checked ?? true;

            this.save();
            document.body.classList.toggle('compact-mode', state.settings.compactMode);

            if (state.settings.desktopNotifications) {
                await Notifications.requestPermission();
            }

            try {
                const data = await API.request('/api/users/profile', {
                    method: 'PUT',
                    body: { displayName, bio }
                });

                if (data.user) {
                    state.user = data.user;
                    UI.updateUserInterface();
                    Modal.close('settings-modal');
                    Toast.success('Settings saved!');
                }
            } catch (error) {
                Toast.error(error.message || 'Failed to save settings');
            }
        },

        populateUI() {
            if (state.user) {
                const avatar = state.user.avatar || Utils.generateAvatar(state.user.username);
                $('settings-avatar').src = avatar;
                $('settings-displayname').value = state.user.displayName || '';
                $('settings-bio').value = state.user.bio || '';
                $('settings-username').value = state.user.username || '';
                $('settings-email').value = state.user.email || '';
            }

            $('compact-mode').checked = state.settings.compactMode;
            $('show-timestamps').checked = state.settings.showTimestamps;
            $('sound-enabled').checked = state.settings.soundEnabled;
            $('desktop-notifications').checked = state.settings.desktopNotifications;
            $('message-preview').checked = state.settings.messagePreview;
            $('use-24h').checked = state.settings.use24h;
            $('show-online-status').checked = state.settings.showOnlineStatus;
            $('show-typing').checked = state.settings.showTyping;
            $('read-receipts').checked = state.settings.readReceipts;
        }
    };

    // ============================================
    // SEARCH
    // ============================================
    const Search = {
        perform(query) {
            const messages = state.messages.get(state.currentRoom) || [];

            $$('.message.search-result').forEach(el => el.classList.remove('search-result'));

            if (!query || query.length < 2) return;

            const lowerQuery = query.toLowerCase();
            const results = messages.filter(m =>
                m.text?.toLowerCase().includes(lowerQuery) ||
                m.username?.toLowerCase().includes(lowerQuery) ||
                m.displayName?.toLowerCase().includes(lowerQuery)
            );

            results.forEach(msg => {
                const el = document.querySelector(`[data-message-id="${msg.id}"]`);
                if (el) el.classList.add('search-result');
            });

            if (results.length > 0) {
                Messages.scrollTo(results[0].id);
                Toast.info(`Found ${results.length} result(s)`);
            } else {
                Toast.info('No results found');
            }
        },

        clear() {
            $('search-input').value = '';
            $$('.message.search-result').forEach(el => el.classList.remove('search-result'));
        }
    };

    // ============================================
    // ADMIN PANEL
    // ============================================
    const Admin = {
        init() {
            if (!state.isMaster) return;

            // Load saved admin data
            const savedData = Storage.get(CONFIG.STORAGE_KEYS.ADMIN_DATA);
            if (savedData) {
                Object.assign(state.adminData, savedData);
            }

            this.updateDashboard();
            this.attachEventListeners();
            this.requestStats();
        },

        attachEventListeners() {
            // Nav items
            $$('.admin-nav-item').forEach(item => {
                item.onclick = () => this.switchPanel(item.dataset.panel);
            });

            // Dashboard actions
            $('refresh-dashboard')?.addEventListener('click', () => this.updateDashboard());
            $('quick-broadcast')?.addEventListener('click', () => Modal.open('broadcast-modal'));
            $('quick-mute-all')?.addEventListener('click', () => this.muteAllUsers());
            $('quick-clear-cache')?.addEventListener('click', () => this.clearCache());
            $('quick-maintenance')?.addEventListener('click', () => this.toggleMaintenance());
            $('quick-export')?.addEventListener('click', () => this.exportAllData());
            $('quick-reset')?.addEventListener('click', () => this.factoryReset());

            // Broadcast
            $('send-broadcast-btn')?.addEventListener('click', () => this.sendBroadcast());
            $('broadcast-target')?.addEventListener('change', (e) => {
                $('broadcast-room-select').style.display = e.target.value === 'room' ? 'block' : 'none';
            });

            // Announcement
            $('send-announcement')?.addEventListener('click', () => this.sendAnnouncement());
            $('preview-announcement')?.addEventListener('click', () => this.previewAnnouncement());

            // System settings
            $('save-system-settings')?.addEventListener('click', () => this.saveSystemSettings());

            // Data management
            $('export-all-data')?.addEventListener('click', () => this.exportAllData());
            $('import-data')?.addEventListener('click', () => $('import-file').click());
            $('import-file')?.addEventListener('change', (e) => this.importData(e));
            $('clear-all-messages')?.addEventListener('click', () => this.clearAllMessages());
            $('factory-reset')?.addEventListener('click', () => this.factoryReset());

            // Logs
            $('export-logs')?.addEventListener('click', () => this.exportLogs());
            $('clear-logs')?.addEventListener('click', () => this.clearLogs());

            // User management
            $('user-search')?.addEventListener('input', Utils.debounce((e) => this.searchUsers(e.target.value), 300));
            $('user-filter')?.addEventListener('change', (e) => this.filterUsers(e.target.value));
            $('select-all-users')?.addEventListener('change', (e) => this.selectAllUsers(e.target.checked));

            // Admin room creation
            $('admin-create-room')?.addEventListener('click', () => Modal.open('create-room-modal'));
        },

        switchPanel(panel) {
            state.currentAdminPanel = panel;

            $$('.admin-nav-item').forEach(item => {
                item.classList.toggle('active', item.dataset.panel === panel);
            });

            $$('.admin-panel').forEach(p => {
                p.classList.toggle('active', p.id === `panel-${panel}`);
            });

            // Load panel-specific data
            switch (panel) {
                case 'dashboard': this.updateDashboard(); break;
                case 'users': this.loadUsers(); break;
                case 'online': this.loadOnlineUsers(); break;
                case 'rooms': this.loadRooms(); break;
                case 'messages': this.loadMessages(); break;
                case 'logs': this.loadLogs(); break;
                case 'banned': this.loadBannedUsers(); break;
            }
        },

        requestStats() {
            SocketManager.send({ type: 'admin_get_stats' });
        },

        updateStats(stats) {
            state.adminData.stats = stats;
            this.updateDashboard();
        },

        updateDashboard() {
            const stats = state.adminData.stats;

            // Main stats
            $('dash-total-users').textContent = stats.totalUsers || state.allUsers.size;
            $('dash-online-users').textContent = stats.onlineUsers || state.onlineUsers.size;
            $('dash-total-messages').textContent = stats.totalMessages || 0;
            $('dash-total-rooms').textContent = stats.totalRooms || state.rooms.length;

            // Quick stats in sidebar
            $('stat-total-users').textContent = stats.totalUsers || state.allUsers.size;
            $('stat-online-users').textContent = stats.onlineUsers || state.onlineUsers.size;
            $('stat-total-messages').textContent = stats.totalMessages || 0;

            // Changes
            $('dash-users-change').textContent = `+${stats.newUsersToday || 0} today`;
            $('dash-messages-change').textContent = `+${stats.messagesToday || 0} today`;

            // System status
            const maintenanceStatus = $('maintenance-status');
            const maintenanceValue = $('maintenance-value');
            if (state.adminData.systemSettings.maintenanceMode) {
                maintenanceStatus?.classList.remove('online');
                maintenanceStatus?.classList.add('warning');
                if (maintenanceValue) maintenanceValue.textContent = 'On';
            } else {
                maintenanceStatus?.classList.remove('warning');
                maintenanceStatus?.classList.add('online');
                if (maintenanceValue) maintenanceValue.textContent = 'Off';
            }

            // Role counts
            const roles = { admin: 0, mod: 0, member: 0 };
            state.allUsers.forEach(u => {
                if (roles[u.role] !== undefined) roles[u.role]++;
            });
            $('admin-count').textContent = `${roles.admin} users`;
            $('mod-count').textContent = `${roles.mod} users`;
            $('member-count').textContent = `${roles.member} users`;
        },

        updateOnlineCount() {
            $('stat-online-users').textContent = state.onlineUsers.size;
            $('dash-online-users').textContent = state.onlineUsers.size;
        },

        incrementMessageCount() {
            state.adminData.stats.totalMessages = (state.adminData.stats.totalMessages || 0) + 1;
            state.adminData.stats.messagesToday = (state.adminData.stats.messagesToday || 0) + 1;
            $('dash-total-messages').textContent = state.adminData.stats.totalMessages;
            $('stat-total-messages').textContent = state.adminData.stats.totalMessages;
        },

        loadUsers() {
            const tbody = $('users-table-body');
            if (!tbody) return;

            const users = Array.from(state.allUsers.values());
            tbody.innerHTML = users.map(user => this.renderUserRow(user)).join('');

            $('users-total').textContent = users.length;
            $('users-showing').textContent = users.length;
        },

        renderUserRow(user) {
            const isOnline = state.onlineUsers.has(user.id);
            const avatar = user.avatar || Utils.generateAvatar(user.username);

            return `
                <tr data-user-id="${user.id}">
                    <td><input type="checkbox" class="user-checkbox" data-user-id="${user.id}"></td>
                    <td>
                        <div class="user-cell">
                            <img src="${avatar}" alt="">
                            <div class="user-info">
                                <span class="user-name">${Utils.escapeHtml(user.displayName || user.username)}${Utils.getRoleBadge(user.role)}</span>
                                <span class="user-email">${Utils.escapeHtml(user.username)}</span>
                            </div>
                        </div>
                    </td>
                    <td>${Utils.escapeHtml(user.email || '-')}</td>
                    <td><span class="role-badge ${user.role}">${user.role}</span></td>
                    <td>
                        <span class="status-badge ${isOnline ? 'online' : 'offline'}">
                            <span class="status-dot ${isOnline ? 'online' : 'offline'}"></span>
                            ${isOnline ? 'Online' : 'Offline'}
                        </span>
                    </td>
                    <td>${Utils.formatDateTime(user.createdAt)}</td>
                    <td>${isOnline ? 'Now' : (user.lastSeen ? Utils.formatTime(user.lastSeen) : '-')}</td>
                    <td class="actions-cell">
                        <button title="View" onclick="app.admin.viewUser('${user.id}')">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button title="Edit" onclick="app.admin.editUser('${user.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        ${user.role !== 'master' ? `
                            <button title="Ban" class="danger" onclick="app.admin.banUser('${user.id}')">
                                <i class="fas fa-ban"></i>
                            </button>
                        ` : ''}
                    </td>
                </tr>
            `;
        },

        loadOnlineUsers() {
            const container = $('admin-online-users');
            if (!container) return;

            const users = Array.from(state.onlineUsers.values());

            if (users.length === 0) {
                container.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>No users online</p></div>';
                return;
            }

            container.innerHTML = users.map(user => `
                <div class="online-user-card" data-user-id="${user.id}">
                    <img src="${user.avatar || Utils.generateAvatar(user.username)}" alt="">
                    <div class="user-details">
                        <div class="user-name">${Utils.escapeHtml(user.displayName || user.username)}${Utils.getRoleBadge(user.role)}</div>
                        <div class="user-meta">
                            <span class="status-dot ${user.status || 'online'}"></span>
                            ${user.status || 'online'} • In #${user.currentRoom || 'general'}
                        </div>
                    </div>
                    <div class="user-actions">
                        <button class="btn-icon sm" title="View" onclick="app.admin.viewUser('${user.id}')">
                            <i class="fas fa-eye"></i>
                        </button>
                        ${user.role !== 'master' ? `
                            <button class="btn-icon sm" title="Kick" onclick="app.admin.kickUser('${user.id}')">
                                <i class="fas fa-user-times"></i>
                            </button>
                        ` : ''}
                    </div>
                </div>
            `).join('');
        },

        loadRooms() {
            const container = $('admin-rooms-grid');
            if (!container) return;

            container.innerHTML = state.rooms.map(room => {
                const messageCount = state.messages.get(room.id)?.length || 0;
                return `
                    <div class="admin-room-card" data-room-id="${room.id}">
                        <div class="room-header">
                            <span class="room-icon">${room.icon || '💬'}</span>
                            <span class="room-name">${Utils.escapeHtml(room.name)}</span>
                            ${room.type === 'private' ? '<i class="fas fa-lock" title="Private"></i>' : ''}
                        </div>
                        <div class="room-description">${Utils.escapeHtml(room.description || 'No description')}</div>
                        <div class="room-stats">
                            <div class="room-stat"><i class="fas fa-comments"></i> <span>${messageCount}</span> messages</div>
                        </div>
                        <div class="room-actions">
                            <button class="btn btn-sm btn-secondary" onclick="app.admin.editRoom('${room.id}')">
                                <i class="fas fa-edit"></i> Edit
                            </button>
                            ${room.id !== 'general' ? `
                                <button class="btn btn-sm btn-danger" onclick="app.admin.deleteRoom('${room.id}')">
                                    <i class="fas fa-trash"></i> Delete
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        },

        loadMessages() {
            const tbody = $('messages-table-body');
            const roomFilter = $('message-room-filter');

            if (!tbody) return;

            // Populate room filter
            if (roomFilter) {
                roomFilter.innerHTML = '<option value="all">All Channels</option>' +
                    state.rooms.map(r => `<option value="${r.id}">#${r.name}</option>`).join('');
            }

            const allMessages = [];
            state.messages.forEach((msgs, roomId) => {
                const room = state.rooms.find(r => r.id === roomId);
                msgs.forEach(m => allMessages.push({ ...m, roomName: room?.name || roomId }));
            });

            // Sort by newest first
            allMessages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            // Show last 100
            const recentMessages = allMessages.slice(0, 100);

            tbody.innerHTML = recentMessages.map(msg => `
                <tr data-message-id="${msg.id}">
                    <td><input type="checkbox" class="message-checkbox" data-message-id="${msg.id}"></td>
                    <td>
                        <div class="user-cell">
                            <img src="${msg.avatar || Utils.generateAvatar(msg.username)}" alt="" style="width:24px;height:24px;">
                            <span>${Utils.escapeHtml(msg.displayName || msg.username)}</span>
                        </div>
                    </td>
                    <td>#${msg.roomName}</td>
                    <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                        ${Utils.escapeHtml(Utils.truncate(msg.text, 100))}
                    </td>
                    <td>${Utils.formatTime(msg.createdAt)}</td>
                    <td class="actions-cell">
                        <button title="View" onclick="app.admin.viewMessage('${msg.id}')">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button title="Delete" class="danger" onclick="app.admin.deleteMessage('${msg.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `).join('');
        },

        loadLogs() {
            const container = $('logs-container');
            if (!container) return;

            if (state.adminData.activityLogs.length === 0) {
                container.innerHTML = '<div class="empty-state"><i class="fas fa-clipboard-check"></i><p>No activity logs yet</p></div>';
                return;
            }

            container.innerHTML = state.adminData.activityLogs.map(log => `
                <div class="log-item ${log.type}">
                    <div class="log-icon">
                        <i class="fas ${this.getLogIcon(log.type)}"></i>
                    </div>
                    <div class="log-content">
                        <div class="log-message">${Utils.escapeHtml(log.message)}</div>
                        <div class="log-meta">${Utils.formatDateTime(log.timestamp)}</div>
                    </div>
                </div>
            `).join('');
        },

        getLogIcon(type) {
            const icons = {
                auth: 'fa-sign-in-alt',
                user: 'fa-user',
                admin: 'fa-shield-alt',
                system: 'fa-server',
                error: 'fa-exclamation-circle'
            };
            return icons[type] || 'fa-info-circle';
        },

        loadBannedUsers() {
            const container = $('banned-users-list');
            if (!container) return;

            if (state.adminData.bannedUsers.length === 0) {
                container.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i><p>No banned users</p></div>';
                return;
            }

            container.innerHTML = state.adminData.bannedUsers.map(ban => `
                <div class="banned-user-item">
                    <div class="user-info">
                        <strong>${Utils.escapeHtml(ban.username)}</strong>
                        <span>Banned: ${Utils.formatDateTime(ban.bannedAt)}</span>
                        <span>Reason: ${Utils.escapeHtml(ban.reason || 'No reason provided')}</span>
                    </div>
                    <button class="btn btn-sm btn-secondary" onclick="app.admin.unbanUser('${ban.id}')">
                        <i class="fas fa-undo"></i> Unban
                    </button>
                </div>
            `).join('');
        },

        logActivity(type, message) {
            const log = {
                id: Utils.generateId(),
                type,
                message,
                timestamp: new Date().toISOString()
            };

            state.adminData.activityLogs.unshift(log);

            // Keep only last 500 logs
            if (state.adminData.activityLogs.length > 500) {
                state.adminData.activityLogs = state.adminData.activityLogs.slice(0, 500);
            }

            this.saveAdminData();

            // Update UI if on logs panel
            if (state.currentAdminPanel === 'logs') {
                this.loadLogs();
            }

            // Update recent activity on dashboard
            const activityList = $('recent-activity');
            if (activityList) {
                const item = document.createElement('div');
                item.className = 'activity-item';
                item.innerHTML = `
                    <div class="activity-icon"><i class="fas ${this.getLogIcon(type)}"></i></div>
                    <div class="activity-content">
                        <span class="activity-text">${Utils.escapeHtml(message)}</span>
                        <span class="activity-time">Just now</span>
                    </div>
                `;
                activityList.insertBefore(item, activityList.firstChild);

                // Keep only last 10 in dashboard
                while (activityList.children.length > 10) {
                    activityList.removeChild(activityList.lastChild);
                }
            }
        },

        addLog(log) {
            state.adminData.activityLogs.unshift(log);
            this.saveAdminData();
        },

        saveAdminData() {
            Storage.set(CONFIG.STORAGE_KEYS.ADMIN_DATA, state.adminData);
        },

        // User Actions
        viewUser(userId) {
            Profile.show(userId);
        },

        editUser(userId) {
            const user = state.allUsers.get(userId);
            if (!user) return;

            $('admin-edit-user-id').value = userId;
            $('admin-edit-username').value = user.username;
            $('admin-edit-displayname').value = user.displayName || '';
            $('admin-edit-email').value = user.email || '';
            $('admin-edit-role').value = user.role || 'member';
            $('admin-edit-password').value = '';
            $('admin-edit-verified').checked = user.verified || false;
            $('admin-edit-muted').checked = user.muted || false;
            $('admin-edit-banned').checked = user.banned || false;

            $('admin-user-modal-title').textContent = 'Edit User';
            Modal.open('admin-user-modal');
        },

        async saveUser() {
            const userId = $('admin-edit-user-id').value;
            const data = {
                username: $('admin-edit-username').value.trim(),
                displayName: $('admin-edit-displayname').value.trim(),
                email: $('admin-edit-email').value.trim(),
                role: $('admin-edit-role').value,
                verified: $('admin-edit-verified').checked,
                muted: $('admin-edit-muted').checked,
                banned: $('admin-edit-banned').checked
            };

            const password = $('admin-edit-password').value;
            if (password) data.password = password;

            try {
                await API.request(`/api/admin/users/${userId}`, {
                    method: 'PUT',
                    body: data
                });

                // Update local state
                const user = state.allUsers.get(userId);
                if (user) Object.assign(user, data);

                Modal.close('admin-user-modal');
                Toast.success('User updated successfully');
                this.logActivity('admin', `Updated user: ${data.username}`);
                this.loadUsers();
            } catch (error) {
                Toast.error(error.message || 'Failed to update user');
            }
        },

        async deleteUser(userId) {
            const user = state.allUsers.get(userId);
            if (!user) return;

            if (user.role === 'master') {
                Toast.error('Cannot delete master user');
                return;
            }

            Modal.confirm('Delete User', `Are you sure you want to delete ${user.username}? This action cannot be undone.`, async () => {
                try {
                    await API.request(`/api/admin/users/${userId}`, { method: 'DELETE' });

                    state.allUsers.delete(userId);
                    state.onlineUsers.delete(userId);

                    Modal.close('admin-user-modal');
                    Toast.success('User deleted');
                    this.logActivity('admin', `Deleted user: ${user.username}`);
                    this.loadUsers();
                } catch (error) {
                    Toast.error(error.message || 'Failed to delete user');
                }
            });
        },

        muteUser(userId, duration = null) {
            const user = state.allUsers.get(userId);
            if (!user) return;

            if (user.role === 'master') {
                Toast.error('Cannot mute master user');
                return;
            }

            Modal.confirm('Mute User', `Are you sure you want to mute ${user.displayName || user.username}?`, () => {
                SocketManager.send({
                    type: 'admin_mute_user',
                    userId,
                    muted: true,
                    duration
                });
                Toast.success(`${user.username} has been muted`);
                this.logActivity('admin', `Muted user: ${user.username}`);
            });
        },

        kickUser(userId) {
            const user = state.onlineUsers.get(userId);
            if (!user) {
                Toast.error('User is not online');
                return;
            }

            if (user.role === 'master') {
                Toast.error('Cannot kick master user');
                return;
            }

            Modal.confirm('Kick User', `Are you sure you want to kick ${user.displayName || user.username}?`, () => {
                SocketManager.send({
                    type: 'admin_kick_user',
                    userId
                });
                Toast.success(`${user.username} has been kicked`);
                this.logActivity('admin', `Kicked user: ${user.username}`);
            });
        },

        banUser(userId) {
            const user = state.allUsers.get(userId);
            if (!user) return;

            if (user.role === 'master') {
                Toast.error('Cannot ban master user');
                return;
            }

            Modal.confirm('Ban User', `Are you sure you want to ban ${user.displayName || user.username}? They will not be able to access the chat.`, () => {
                SocketManager.send({
                    type: 'admin_ban_user',
                    userId,
                    reason: 'Banned by administrator'
                });
                Toast.success(`${user.username} has been banned`);
                this.logActivity('admin', `Banned user: ${user.username}`);
            }, { confirmClass: 'btn-danger' });
        },

        unbanUser(userId) {
            SocketManager.send({
                type: 'admin_unban_user',
                userId
            });

            state.adminData.bannedUsers = state.adminData.bannedUsers.filter(u => u.id !== userId);
            this.saveAdminData();
            this.loadBannedUsers();
            Toast.success('User has been unbanned');
            this.logActivity('admin', `Unbanned user ID: ${userId}`);
        },

        addBannedUser(data) {
            state.adminData.bannedUsers.push({
                id: data.userId,
                username: data.username,
                reason: data.reason,
                bannedAt: new Date().toISOString(),
                bannedBy: state.user.username
            });
            this.saveAdminData();
        },

        warnUser(userId) {
            const user = state.allUsers.get(userId);
            if (!user) return;

            // In a real app, you'd have a warning system
            Toast.info(`Warning sent to ${user.username}`);
            this.logActivity('admin', `Warned user: ${user.username}`);
        },

        changeUserRole(userId, newRole) {
            const user = state.allUsers.get(userId);
            if (!user) return;

            if (user.role === 'master') {
                Toast.error('Cannot change master role');
                return;
            }

            if (newRole === 'master') {
                Toast.error('Cannot assign master role');
                return;
            }

            SocketManager.send({
                type: 'admin_change_role',
                userId,
                role: newRole
            });

            user.role = newRole;
            Toast.success(`${user.username} is now ${newRole}`);
            this.logActivity('admin', `Changed role of ${user.username} to ${newRole}`);
        },

        searchUsers(query) {
            const rows = $$('#users-table-body tr');
            const lowerQuery = query.toLowerCase();

            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(lowerQuery) ? '' : 'none';
            });
        },

        filterUsers(filter) {
            const rows = $$('#users-table-body tr');

            rows.forEach(row => {
                const userId = row.dataset.userId;
                const user = state.allUsers.get(userId);

                let show = true;
                switch (filter) {
                    case 'online':
                        show = state.onlineUsers.has(userId);
                        break;
                    case 'offline':
                        show = !state.onlineUsers.has(userId);
                        break;
                    case 'admin':
                        show = user?.role === 'admin';
                        break;
                    case 'mod':
                        show = user?.role === 'mod';
                        break;
                    case 'banned':
                        show = user?.banned;
                        break;
                }

                row.style.display = show ? '' : 'none';
            });
        },

        selectAllUsers(checked) {
            $$('.user-checkbox').forEach(cb => cb.checked = checked);
            this.updateBulkActions();
        },

        updateBulkActions() {
            const selected = $$('.user-checkbox:checked').length;
            const bulkActions = $('users-bulk-actions');

            if (bulkActions) {
                bulkActions.style.display = selected > 0 ? 'flex' : 'none';
                $('selected-count').textContent = selected;
            }
        },

        // Room Actions
        editRoom(roomId) {
            // In a real app, you'd open an edit modal
            Toast.info('Room editing would open here');
        },

        deleteRoom(roomId) {
            Rooms.delete(roomId);
        },

        // Message Actions
        viewMessage(messageId) {
            let foundMessage = null;
            let foundRoom = null;

            state.messages.forEach((msgs, roomId) => {
                const msg = msgs.find(m => m.id === messageId);
                if (msg) {
                    foundMessage = msg;
                    foundRoom = roomId;
                }
            });

            if (foundMessage && foundRoom) {
                Rooms.join(foundRoom);
                setTimeout(() => Messages.scrollTo(messageId), 500);
                UI.showScreen('chat-screen');
            }
        },

        deleteMessage(messageId) {
            Modal.confirm('Delete Message', 'Are you sure you want to delete this message?', () => {
                SocketManager.send({ type: 'delete', messageId });
                this.logActivity('admin', 'Deleted a message');
            });
        },

        pinMessage(messageId) {
            // Toggle pin
            Toast.info('Message pinned');
            this.logActivity('admin', 'Pinned a message');
        },

        // Broadcast & Announcements
        sendBroadcast() {
            const message = $('broadcast-message').value.trim();
            const target = $('broadcast-target').value;
            const roomId = $('broadcast-room').value;

            if (!message) {
                Toast.error('Please enter a message');
                return;
            }

            SocketManager.send({
                type: 'admin_broadcast',
                message,
                target,
                roomId
            });

            Modal.close('broadcast-modal');
            $('broadcast-message').value = '';
            Toast.success('Broadcast sent!');
            this.logActivity('admin', `Sent broadcast: ${Utils.truncate(message, 50)}`);
        },

        sendAnnouncement() {
            const text = $('announcement-input').value.trim();
            const type = $('announcement-type').value;
            const duration = parseInt($('announcement-duration').value);

            if (!text) {
                Toast.error('Please enter announcement text');
                return;
            }

            const announcement = {
                id: Utils.generateId(),
                text,
                type,
                duration,
                createdAt: new Date().toISOString(),
                createdBy: state.user.username
            };

            SocketManager.send({
                type: 'admin_announcement',
                announcement
            });

            state.adminData.announcements.unshift(announcement);
            this.saveAdminData();

            $('announcement-input').value = '';
            Toast.success('Announcement sent!');
            this.logActivity('admin', `Sent announcement: ${Utils.truncate(text, 50)}`);
        },

        previewAnnouncement() {
            const text = $('announcement-input').value.trim();
            const type = $('announcement-type').value;

            if (text) {
                UI.showAnnouncement({ text, type, preview: true });
            }
        },

        // System Actions
        muteAllUsers() {
            Modal.confirm('Mute All Users', 'Are you sure you want to mute all non-admin users?', () => {
                SocketManager.send({ type: 'admin_mute_all' });
                Toast.success('All users have been muted');
                this.logActivity('admin', 'Muted all users');
            }, { icon: 'fa-volume-mute' });
        },

        clearCache() {
            Modal.confirm('Clear Cache', 'This will clear all cached data. Continue?', () => {
                localStorage.clear();
                sessionStorage.clear();
                Toast.success('Cache cleared');
                this.logActivity('system', 'Cache cleared');
            });
        },

        toggleMaintenance() {
            state.adminData.systemSettings.maintenanceMode = !state.adminData.systemSettings.maintenanceMode;
            this.saveAdminData();

            SocketManager.send({
                type: 'admin_maintenance',
                enabled: state.adminData.systemSettings.maintenanceMode
            });

            Toast.info(`Maintenance mode ${state.adminData.systemSettings.maintenanceMode ? 'enabled' : 'disabled'}`);
            this.logActivity('system', `Maintenance mode ${state.adminData.systemSettings.maintenanceMode ? 'enabled' : 'disabled'}`);
            this.updateDashboard();
        },

        exportAllData() {
            const data = {
                exportDate: new Date().toISOString(),
                users: Array.from(state.allUsers.values()),
                rooms: state.rooms,
                messages: {},
                settings: state.adminData.systemSettings,
                logs: state.adminData.activityLogs
            };

            state.messages.forEach((msgs, roomId) => {
                data.messages[roomId] = msgs;
            });

            Utils.downloadJson(data, `chathub-backup-${Date.now()}.json`);
            Toast.success('Data exported successfully');
            this.logActivity('system', 'Data exported');
        },

        async importData(e) {
            const file = e.target.files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                const data = JSON.parse(text);

                Modal.confirm('Import Data', 'This will overwrite existing data. Continue?', () => {
                    // In a real app, you'd send this to the server
                    Toast.success('Data imported successfully');
                    this.logActivity('system', 'Data imported');
                }, { icon: 'fa-file-import', confirmText: 'Import' });
            } catch (error) {
                Toast.error('Invalid backup file');
            }
        },

        clearAllMessages() {
            Modal.confirm('Clear All Messages', 'This will delete ALL messages from ALL channels. This cannot be undone!', () => {
                SocketManager.send({ type: 'admin_clear_messages' });
                state.messages.clear();
                Messages.render();
                Toast.success('All messages cleared');
                this.logActivity('admin', 'Cleared all messages');
            }, { icon: 'fa-trash-alt', confirmClass: 'btn-danger' });
        },

        factoryReset() {
            Modal.confirm('Factory Reset', 'This will DELETE ALL DATA including users, messages, and settings. This CANNOT be undone! Are you absolutely sure?', () => {
                Modal.confirm('Confirm Factory Reset', 'Type "RESET" to confirm you want to delete everything.', () => {
                    SocketManager.send({ type: 'admin_factory_reset' });
                    Storage.clear();
                    Toast.warning('Factory reset initiated. Reloading...');
                    setTimeout(() => location.reload(), 2000);
                }, { icon: 'fa-skull-crossbones', confirmClass: 'btn-danger', confirmText: 'RESET EVERYTHING' });
            }, { icon: 'fa-exclamation-triangle', confirmClass: 'btn-danger' });
        },

        exportLogs() {
            Utils.downloadJson(state.adminData.activityLogs, `chathub-logs-${Date.now()}.json`);
            Toast.success('Logs exported');
        },

        clearLogs() {
            Modal.confirm('Clear Logs', 'Delete all activity logs?', () => {
                state.adminData.activityLogs = [];
                this.saveAdminData();
                this.loadLogs();
                Toast.success('Logs cleared');
            });
        },

        saveSystemSettings() {
            state.adminData.systemSettings = {
                siteName: $('setting-site-name').value,
                welcomeMessage: $('setting-welcome-msg').value,
                maxFileSize: parseInt($('setting-max-file').value),
                allowRegistration: $('setting-allow-registration').checked,
                emailVerification: $('setting-email-verification').checked,
                inviteOnly: $('setting-invite-only').checked,
                messageLimit: parseInt($('setting-msg-limit').value),
                allowUploads: $('setting-allow-uploads').checked,
                enableReactions: $('setting-enable-reactions').checked,
                linkPreviews: $('setting-link-previews').checked,
                profanityFilter: $('setting-profanity-filter').checked,
                spamProtection: $('setting-spam-protection').checked,
                newUserSlowmode: parseInt($('setting-new-user-slowmode').value)
            };

            this.saveAdminData();

            SocketManager.send({
                type: 'admin_update_settings',
                settings: state.adminData.systemSettings
            });

            Toast.success('Settings saved');
            this.logActivity('admin', 'Updated system settings');
        }
    };

    // ============================================
    // UI MANAGER
    // ============================================
    const UI = {
        showScreen(id) {
            $$('.screen').forEach(s => s.classList.remove('active'));
            $(id)?.classList.add('active');
        },

        updateUserInterface() {
            if (!state.user) return;

            const avatar = state.user.avatar || Utils.generateAvatar(state.user.username);

            $('user-avatar').src = avatar;
            $('user-displayname').textContent = state.user.displayName || state.user.username;
            $('user-username').textContent = `@${state.user.username}`;
            $('user-status-dot').className = `status-dot ${state.user.status || 'online'}`;

            if (state.isMaster) {
                $('admin-username').textContent = state.user.username;
            }

            Settings.populateUI();
            this.updateRoomsList();
            this.renderOnlineUsers();
        },

        updateRoomsList() {
            const container = $('rooms-list');
            if (!container) return;

            container.innerHTML = state.rooms.map(room => {
                const unread = state.unreadCounts.get(room.id) || 0;
                const isPrivate = room.type === 'private';
                return `
                    <div class="room-item ${room.id === state.currentRoom ? 'active' : ''}" 
                         data-room-id="${room.id}">
                        <span class="room-icon">${room.icon || '💬'}</span>
                        <span class="room-name">${Utils.escapeHtml(room.name)}</span>
                        ${isPrivate ? '<i class="fas fa-lock private-icon"></i>' : ''}
                        ${unread > 0 ? `<span class="room-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
                    </div>
                `;
            }).join('');

            container.querySelectorAll('.room-item').forEach(el => {
                el.onclick = () => Rooms.join(el.dataset.roomId);
            });
        },

        updateRoomHeader() {
            const room = state.rooms.find(r => r.id === state.currentRoom);
            if (room) {
                $('chat-room-icon').textContent = room.icon || '💬';
                $('chat-room-name').textContent = room.name;
                $('chat-room-description').textContent = room.description || '';
                $('welcome-room-name').textContent = room.name;
            }
        },

        renderOnlineUsers() {
            const container = $('online-users-list');
            if (!container) return;

            const users = Array.from(state.onlineUsers.values()).sort((a, b) => {
                const roleOrder = CONFIG.ROLE_HIERARCHY;
                return (roleOrder[a.role] || 3) - (roleOrder[b.role] || 3);
            });

            $('online-count').textContent = users.length;

            container.innerHTML = users.map(user => `
                <div class="online-user" data-user-id="${user.id}">
                    <div class="user-avatar-wrapper">
                        <img class="user-avatar" src="${user.avatar || Utils.generateAvatar(user.username)}" alt="">
                        <span class="status-dot ${user.status || 'online'}"></span>
                    </div>
                    <span class="user-name">${Utils.escapeHtml(user.displayName || user.username)}${Utils.getRoleBadge(user.role)}</span>
                </div>
            `).join('');

            container.querySelectorAll('.online-user').forEach(el => {
                el.onclick = () => Profile.show(el.dataset.userId);
                el.oncontextmenu = (e) => {
                    e.preventDefault();
                    const user = state.onlineUsers.get(el.dataset.userId);
                    if (user) ContextMenu.showUser(e, user);
                };
            });
        },

        updateTypingIndicator() {
            const indicator = $('typing-indicator');
            if (!indicator) return;

            const users = Array.from(state.typingUsers.values());

            if (users.length === 0) {
                indicator.classList.remove('show');
                return;
            }

            let text = '';
            if (users.length === 1) {
                text = `${users[0].displayName || users[0].username} is typing...`;
            } else if (users.length === 2) {
                text = `${users[0].displayName || users[0].username} and ${users[1].displayName || users[1].username} are typing...`;
            } else {
                text = `${users.length} people are typing...`;
            }

            $('typing-text').textContent = text;
            indicator.classList.add('show');
        },

        updateConnectionStatus(status) {
            const el = $('connection-status');
            if (el) {
                el.className = `connection-status ${status}`;
                el.title = status.charAt(0).toUpperCase() + status.slice(1);
            }
        },

        scrollToBottom(force = false) {
            const container = $('messages-container');
            if (container && (force || state.isScrolledToBottom)) {
                requestAnimationFrame(() => {
                    container.scrollTop = container.scrollHeight;
                });
            }
        },

        toggleSidebar() {
            $('sidebar')?.classList.toggle('collapsed');
        },

        openMobileSidebar() {
            $('sidebar')?.classList.add('open');
            $('sidebar-overlay')?.classList.add('show');
        },

        closeMobileSidebar() {
            $('sidebar')?.classList.remove('open');
            $('sidebar-overlay')?.classList.remove('show');
        },

        toggleRightSidebar() {
            const sidebar = $('right-sidebar');
            state.rightSidebarOpen = !state.rightSidebarOpen;
            sidebar?.classList.toggle('show', state.rightSidebarOpen);
        },

        setButtonLoading(btn, loading) {
            if (!btn) return;
            btn.disabled = loading;
            if (loading) {
                btn.dataset.originalHtml = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            } else if (btn.dataset.originalHtml) {
                btn.innerHTML = btn.dataset.originalHtml;
            }
        },

        autoResizeTextarea(textarea) {
            if (!textarea) return;
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
        },

        showAnnouncement(data) {
            const banner = $('announcement-banner');
            const text = $('announcement-text');

            if (banner && text) {
                text.textContent = data.text;
                banner.className = `announcement-banner ${data.type || 'info'}`;
                banner.style.display = 'flex';

                if (data.duration && data.duration > 0) {
                    setTimeout(() => {
                        banner.style.display = 'none';
                    }, data.duration * 60 * 1000);
                }
            }
        }
    };

    // ============================================
    // EVENT LISTENERS
    // ============================================
    function attachEventListeners() {
        // Auth
        $('login-btn')?.addEventListener('click', () => Auth.login());
        $('register-btn')?.addEventListener('click', () => Auth.register());
        $('show-register')?.addEventListener('click', (e) => { e.preventDefault(); Auth.showForm('register'); });
        $('show-login')?.addEventListener('click', (e) => { e.preventDefault(); Auth.showForm('login'); });

        $('login-username')?.addEventListener('keypress', (e) => e.key === 'Enter' && $('login-password')?.focus());
        $('login-password')?.addEventListener('keypress', (e) => e.key === 'Enter' && Auth.login());
        $('register-confirm')?.addEventListener('keypress', (e) => e.key === 'Enter' && Auth.register());
        $('register-password')?.addEventListener('input', (e) => Auth.updatePasswordStrength(e.target.value));

        // Password toggles
        $$('.password-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const input = $(btn.dataset.target);
                const icon = btn.querySelector('i');
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

        // Sidebar
        $('sidebar-toggle')?.addEventListener('click', () =>             UI.toggleSidebar()
    );
    $('mobile-menu-btn')?.addEventListener('click', () => UI.openMobileSidebar());
    $('sidebar-overlay')?.addEventListener('click', () => UI.closeMobileSidebar());

    // Right Sidebar
    $('members-btn')?.addEventListener('click', () => UI.toggleRightSidebar());
    $('close-right-sidebar')?.addEventListener('click', () => UI.toggleRightSidebar());

    // Admin Panel Toggle
    $('admin-panel-btn')?.addEventListener('click', () => {
        if (state.isMaster) {
            UI.showScreen('admin-screen');
            Admin.init();
        }
    });
    $('admin-back-btn')?.addEventListener('click', () => {
        UI.showScreen('chat-screen');
        UI.scrollToBottom();
    });

    // Status Dropdown
    $('status-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        $('status-dropdown')?.classList.toggle('show');
    });

    $$('#status-dropdown .status-option').forEach(opt => {
        opt.addEventListener('click', () => {
            const status = opt.dataset.status;
            SocketManager.send({ type: 'status', status });
            $('status-dropdown')?.classList.remove('show');
        });
    });

    // Settings
    $('settings-btn')?.addEventListener('click', () => {
        Settings.populateUI();
        Modal.open('settings-modal');
    });
    $('save-settings')?.addEventListener('click', () => Settings.saveAll());
    $('logout-btn')?.addEventListener('click', () => Auth.logout());
    
    $('avatar-upload-wrapper')?.addEventListener('click', () => $('avatar-input')?.click());
    $('avatar-input')?.addEventListener('change', (e) => FileHandler.uploadAvatar(e));

    $$('.settings-tab').forEach(tab => {
        tab.addEventListener('click', () => Settings.switchTab(tab.dataset.tab));
    });

    $$('.theme-option').forEach(btn => {
        btn.addEventListener('click', () => Theme.set(btn.dataset.theme));
    });

    // Room Creation
    $('create-room-btn')?.addEventListener('click', () => Modal.open('create-room-modal'));
    $('create-room-confirm')?.addEventListener('click', () => Rooms.create());

    $$('#create-room-modal .icon-selector button').forEach(btn => {
        btn.addEventListener('click', () => {
            $('room-icon-input').value = btn.dataset.icon;
            $$('#create-room-modal .icon-selector button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Message Input
    const messageInput = $('message-input');
    if (messageInput) {
        messageInput.addEventListener('input', (e) => {
            UI.autoResizeTextarea(e.target);
            Messages.handleTyping();
        });

        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && state.settings.enterToSend) {
                e.preventDefault();
                Messages.send();
            }
        });

        // Load Draft
        const draft = Storage.get(CONFIG.STORAGE_KEYS.DRAFT + '_' + state.currentRoom);
        if (draft) {
            messageInput.value = draft;
            UI.autoResizeTextarea(messageInput);
        }

        // Save Draft
        messageInput.addEventListener('input', Utils.debounce((e) => {
            Storage.set(CONFIG.STORAGE_KEYS.DRAFT + '_' + state.currentRoom, e.target.value);
        }, 500));
    }

    // Message Actions
    $('send-btn')?.addEventListener('click', () => Messages.send());
    $('attach-btn')?.addEventListener('click', () => $('file-input')?.click());
    $('file-input')?.addEventListener('change', (e) => FileHandler.handleSelect(e));
    $('cancel-reply')?.addEventListener('click', () => Messages.clearReply());
    $('cancel-attachment')?.addEventListener('click', () => Messages.clearAttachment());
    $('scroll-bottom-btn')?.addEventListener('click', () => UI.scrollToBottom(true));

    // Close Announcement
    $('close-announcement')?.addEventListener('click', () => {
        $('announcement-banner').style.display = 'none';
    });

    // Emoji Picker
    $('emoji-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        EmojiPicker.toggle();
    });
    
    $('emoji-close')?.addEventListener('click', () => EmojiPicker.hide());

    $$('#emoji-categories button').forEach(btn => {
        btn.addEventListener('click', () => EmojiPicker.load(btn.dataset.category));
    });

    $('emoji-grid')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-emoji]');
        if (btn) EmojiPicker.insert(btn.dataset.emoji);
    });

    $('emoji-grid')?.addEventListener('mouseover', (e) => {
        const btn = e.target.closest('[data-emoji]');
        if (btn && $('emoji-preview')) {
            $('emoji-preview').innerHTML = `
                <span class="emoji-preview-icon">${btn.dataset.emoji}</span>
                <span class="emoji-preview-name">${btn.title}</span>
            `;
        }
    });

    $('emoji-search')?.addEventListener('input', Utils.debounce((e) => {
        const query = e.target.value.toLowerCase();
        const grid = $('emoji-grid');
        if (!grid || !query) {
            EmojiPicker.load(state.currentEmojiCategory);
            return;
        }
        
        // Flatten emojis for search
        let allEmojis = [];
        Object.keys(EMOJIS).forEach(cat => {
            allEmojis = allEmojis.concat(EMOJIS[cat]);
        });
        
        grid.innerHTML = allEmojis.slice(0, 50).map(emoji => `
            <button data-emoji="${emoji}" title="${emoji}">${emoji}</button>
        `).join('');
    }, 300));

    // Theme
    $('theme-btn')?.addEventListener('click', () => Theme.cycle());

    // Search
    $('search-input')?.addEventListener('input', Utils.debounce((e) => {
        Search.perform(e.target.value);
    }, CONFIG.DEBOUNCE_DELAY));

    // Modals
    $$('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => Modal.close(btn.dataset.closeModal));
    });

    $$('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) Modal.close(modal.id);
        });
    });

    // Context Menus
    $('context-menu')?.addEventListener('click', (e) => {
        const item = e.target.closest('.context-menu-item');
        if (item) ContextMenu.handleMessageAction(item.dataset.action);
    });

    $('user-context-menu')?.addEventListener('click', (e) => {
        const item = e.target.closest('.context-menu-item');
        if (item) ContextMenu.handleUserAction(item.dataset.action);
    });

    // Global Document Clicks
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#status-dropdown') && !e.target.closest('#status-btn')) {
            $('status-dropdown')?.classList.remove('show');
        }
        if (!e.target.closest('#emoji-picker') && !e.target.closest('#emoji-btn')) {
            EmojiPicker.hide();
        }
        if (!e.target.closest('.context-menu')) {
            ContextMenu.hide();
        }
    });

    // Global Keydown
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            Modal.closeAll();
            EmojiPicker.hide();
            ContextMenu.hide();
            Messages.clearReply();
            Search.clear();

            if (state.editingMessage) {
                const msg = (state.messages.get(state.currentRoom) || []).find(m => m.id === state.editingMessage);
                if (msg) Messages.cancelEdit(state.editingMessage, msg);
            }
        }

        // Ctrl/Cmd + K for search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            $('search-input')?.focus();
        }

        // Ctrl/Cmd + / for message input
        if ((e.ctrlKey || e.metaKey) && e.key === '/') {
            e.preventDefault();
            $('message-input')?.focus();
        }
    });

    // Scroll Tracking
    const messagesContainer = $('messages-container');
    if (messagesContainer) {
        messagesContainer.addEventListener('scroll', Utils.throttle(() => {
            const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
            state.isScrolledToBottom = scrollHeight - scrollTop - clientHeight < CONFIG.SCROLL_THRESHOLD;
            
            const scrollBtn = $('scroll-bottom-btn');
            if (scrollBtn) {
                scrollBtn.style.display = state.isScrolledToBottom ? 'none' : 'flex';
            }
        }, 100));

        // Drag and drop file
        messagesContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            messagesContainer.classList.add('drag-over');
        });

        messagesContainer.addEventListener('dragleave', () => {
            messagesContainer.classList.remove('drag-over');
        });

        messagesContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            messagesContainer.classList.remove('drag-over');
            if (e.dataTransfer.files.length) {
                FileHandler.upload(e.dataTransfer.files[0]);
            }
        });
    }

    // Online/Offline Status
    window.addEventListener('online', () => {
        Toast.success('Back online');
        if (!state.socket || !state.socket.connected) {
            SocketManager.connect();
        }
    });

    window.addEventListener('offline', () => {
        Toast.warning('You are offline. Reconnecting when connection is restored...');
        UI.updateConnectionStatus('disconnected');
    });

    // Save draft on window close
    window.addEventListener('beforeunload', () => {
        const messageInput = $('message-input');
        if (messageInput && messageInput.value.trim()) {
            Storage.set(CONFIG.STORAGE_KEYS.DRAFT + '_' + state.currentRoom, messageInput.value);
        }
    });

    // Resize management
    window.addEventListener('resize', Utils.debounce(() => {
        if (!Utils.isMobile()) {
            UI.closeMobileSidebar();
        }
    }, 250));
}

// ============================================
// INITIALIZATION
// ============================================
function init() {
    console.log('ChatHub initializing...');

    // Load Modules
    Settings.load();
    Theme.init();
    Sound.init();

    // Attach DOM Events
    attachEventListeners();

    // Apply visual settings
    document.body.classList.toggle('compact-mode', state.settings.compactMode);

    // Check Auth
    Auth.checkSession();

    // Register Service Worker for PWA / Offline capabilities
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    console.log('ServiceWorker registered with scope:', registration.scope);
                    
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                Toast.info('New version available! Refresh to update.');
                            }
                        });
                    });
                })
                .catch(err => console.log('ServiceWorker registration failed:', err));
        });
    }

    console.log('ChatHub ready');
}

// ============================================
// EXPOSE GLOBAL API (For HTML inline handlers)
// ============================================
window.app = {
    // Message functions
    replyTo: (id) => Messages.replyTo(id),
    addReaction: (id) => Messages.quickReact(id),
    editMessage: (id) => Messages.edit(id),
    deleteMessage: (id) => Messages.delete(id),
    scrollToMessage: (id) => Messages.scrollTo(id),
    
    // Modals & UI
    openProfile: (id) => Profile.show(id),
    openImage: (url) => {
        $('preview-image').src = url;
        $('download-image').href = url;
        $('open-image').href = url;
        Modal.open('image-modal');
    },
    
    // Mentions & Emoji
    handleMention: (username) => {
        const user = Array.from(state.allUsers.values()).find(
            u => u.username.toLowerCase() === username.toLowerCase()
        );
        if (user) Profile.show(user.id);
    },
    insertEmoji: (emoji) => EmojiPicker.insert(emoji),

    // Admin functionality exposed globally
    admin: {
        viewUser: (id) => Admin.viewUser(id),
        editUser: (id) => Admin.editUser(id),
        banUser: (id) => Admin.banUser(id),
        unbanUser: (id) => Admin.unbanUser(id),
        kickUser: (id) => Admin.kickUser(id),
        editRoom: (id) => Admin.editRoom(id),
        deleteRoom: (id) => Admin.deleteRoom(id),
        viewMessage: (id) => Admin.viewMessage(id),
        deleteMessage: (id) => Admin.deleteMessage(id)
    }
};

// ============================================
// START APPLICATION
// ============================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

})();