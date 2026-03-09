# DM UI & Logic Improvement Plan

## Overview
Improve the Direct Messages (DM) UI and functionality to make DM connections easy and intuitive.

## Current Issues
1. No dedicated DM chat view - clicking DM shows only a toast
2. User search uses browser prompt (bad UX)
3. DM section is buried in sidebar
4. No real-time DM notifications
5. Cannot start DM from user profile
6. No unread badge on DM section header

## Improvement Plan

### Phase 1: UI Improvements
- [ ] **1. Enhanced DM Section Header**
  - Add unread count badge to DM section
  - Make section more prominent with icon and label
  
- [ ] **2. Better DM List Items**
  - Show last seen status for offline users
  - Add hover effects
  - Show "Start a conversation" when empty

- [ ] **3. Dedicated DM Chat View**
  - Create DM chat area that replaces room messages
  - Show user avatar, name, status in header
  - Add back button to return to channels
  - Different styling for DM messages

- [ ] **4. User Search Modal for DM**
  - Replace prompt() with a proper modal
  - Search by username or display name
  - Show online status
  - Quick select from online users list

### Phase 2: Logic Improvements
- [ ] **5. DM Initialization**
  - Load DM conversations on auth
  - Handle currentDM state properly
  - Switch between room and DM views

- [ ] **6. Real-time DM**
  - Handle dm_received websocket events
  - Show notification for new DMs
  - Update DM list in real-time

- [ ] **7. DM from User Profile**
  - Add "Send Message" button in user profile modal
  - Direct DM initiation from user list

- [ ] **8. DM Read Receipts**
  - Mark DM as read when opened
  - Update unread badges

### Phase 3: Polish
- [ ] **9. Empty States**
  - Friendly empty states for no conversations
  
- [ ] **10. Animations**
  - Smooth transitions between views
  - Message animations for DMs

## Files to Modify
1. `public/index.html` - Add DM modal, update DM section
2. `public/style.css` - DM styles, view switching
3. `public/app.js` - DM logic, WebSocket handlers
4. `server.js` - May need minor tweaks (optional)

## Implementation Order
1. Add DM modal for user selection
2. Update DM section styling
3. Create DM chat view (in main area)
4. Implement DM switching logic
5. Add WebSocket handlers
6. Test and polish

