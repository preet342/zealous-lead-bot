const modeService = require('../services/modeService');
const whatsappQr = require('../channels/whatsappQr');

/**
 * Generate full page HTML with sleek modern WabaPanel Left Sidebar Navigation
 * Matches modern dark UI layout with:
 * - WabaPanel Brand Header with collapse/expand toggle
 * - Instant "Search menu..." client filter
 * - Colorful squircle icon badges (Blue, Cyan, Purple, Violet, Teal, Orange, Emerald, Slate)
 * - High-contrast active pill highlight
 * - Right chevron indicators
 * - Live WhatsApp & Bot Mode status
 * - Bottom User Profile card with "BISWAJIT EKKA", email, avatar circle, and quick exit button
 * 
 * @param {Object} options
 * @param {string} options.title - Page title
 * @param {string} options.activeNav - 'inbox' | 'leads' | 'campaigns' | 'groups' | 'qr' | 'channels' | 'training'
 * @param {string} options.contentHtml - Main page body HTML
 * @param {string} [options.extraHead] - Extra CSS / Scripts
 */
function renderSidebarLayout({ title, activeNav, contentHtml, extraHead = '' }) {
  const currentMode = modeService.getBotMode();
  const qrStatus = whatsappQr.getQrStatus();
  const isConnected = qrStatus.status === 'connected';
  
  let modeLabel = '💬 Advisor';
  let modeBadgeClass = 'mode-advisor';
  if (currentMode === 'sales_closer') {
    modeLabel = '🎯 Closer';
    modeBadgeClass = 'mode-closer';
  } else if (currentMode === 'personal_human') {
    modeLabel = '🧑‍🤝‍🧑 Friend';
    modeBadgeClass = 'mode-friend';
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${title} • BWB PANEL</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    :root {
      --sidebar-width: 270px;
      --sidebar-compact-width: 76px;
      --topbar-height: 64px;
      --bg-dark: #090d16;
      --sidebar-bg: #0c1017;
      --sidebar-border: rgba(255, 255, 255, 0.08);
      --card-dark: #0f172a;
      --accent-blue: #2563eb;
      --accent-green: #10b981;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg-dark);
      color: #f8fafc;
      min-height: 100vh;
      overflow-x: hidden;
      display: flex;
    }

    /* CUSTOM SCROLLBAR FOR SIDEBAR */
    .nav-menu::-webkit-scrollbar {
      width: 5px;
    }
    .nav-menu::-webkit-scrollbar-track {
      background: transparent;
    }
    .nav-menu::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.12);
      border-radius: 10px;
    }
    .nav-menu::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.25);
    }

    /* BACKDROP FOR MOBILE */
    .sidebar-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(4px);
      z-index: 998;
      opacity: 0;
      transition: opacity 0.3s ease;
    }
    .sidebar-backdrop.active {
      display: block;
      opacity: 1;
    }

    /* LEFT SIDEBAR CONTAINER */
    .sidebar {
      width: var(--sidebar-width);
      background: linear-gradient(180deg, #0e131d 0%, #090c12 100%);
      border-right: 1px solid var(--sidebar-border);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: fixed;
      top: 0;
      bottom: 0;
      left: 0;
      z-index: 999;
      transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s ease;
      overflow-x: hidden;
      box-shadow: 4px 0 24px rgba(0, 0, 0, 0.35);
    }

    /* MINIMIZED SIDEBAR (DESKTOP) */
    body.minimized-sidebar .sidebar {
      width: var(--sidebar-compact-width);
    }
    body.minimized-sidebar .main-wrapper {
      margin-left: var(--sidebar-compact-width);
    }
    body.minimized-sidebar .brand-title,
    body.minimized-sidebar .sidebar-search-box,
    body.minimized-sidebar .nav-label,
    body.minimized-sidebar .nav-text,
    body.minimized-sidebar .nav-chevron,
    body.minimized-sidebar .status-panel-full,
    body.minimized-sidebar .user-info-meta {
      display: none !important;
    }
    body.minimized-sidebar .status-panel-compact {
      display: flex !important;
    }
    body.minimized-sidebar .sidebar-header {
      padding: 16px 12px;
      justify-content: center;
    }
    body.minimized-sidebar .nav-item {
      justify-content: center;
      padding: 10px 0;
      border-radius: 14px;
    }
    body.minimized-sidebar .nav-item.active {
      background: rgba(255, 255, 255, 0.12);
    }
    body.minimized-sidebar .sidebar-footer {
      padding: 12px 10px;
    }
    body.minimized-sidebar .user-profile-card {
      justify-content: center;
      padding: 8px 4px;
    }

    /* 1. HEADER: LOGO + BRAND + COLLAPSE BUTTON */
    .sidebar-header {
      padding: 18px 16px 14px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .brand-link {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      min-width: 0;
    }
    .brand-logo-badge {
      width: 42px;
      height: 42px;
      min-width: 42px;
      background: #ffffff;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      padding: 4px;
    }
    .brand-logo-icon {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .brand-title {
      font-size: 19px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.3px;
      white-space: nowrap;
    }
    .btn-collapse-sidebar {
      width: 32px;
      height: 32px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      color: #94a3b8;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    .btn-collapse-sidebar:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #ffffff;
      border-color: rgba(255, 255, 255, 0.2);
    }
    .sidebar-close-mobile {
      display: none;
      background: none;
      border: none;
      color: #94a3b8;
      font-size: 20px;
      cursor: pointer;
      padding: 4px;
    }

    /* 2. LIVE SEARCH MENU INPUT */
    .sidebar-search-box {
      padding: 0 16px 10px 16px;
    }
    .search-input-wrap {
      position: relative;
      width: 100%;
    }
    .search-input-wrap svg {
      position: absolute;
      left: 14px;
      top: 50%;
      transform: translateY(-50%);
      color: #64748b;
      pointer-events: none;
    }
    .sidebar-search-input {
      width: 100%;
      height: 40px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.09);
      border-radius: 9999px;
      padding: 0 16px 0 38px;
      font-size: 13.5px;
      color: #ffffff;
      outline: none;
      transition: all 0.2s;
    }
    .sidebar-search-input::placeholder {
      color: #64748b;
    }
    .sidebar-search-input:focus {
      background: rgba(255, 255, 255, 0.08);
      border-color: #38bdf8;
      box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.15);
    }

    /* 3. NAVIGATION MENU LIST */
    .nav-menu {
      padding: 6px 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
    }
    .nav-label {
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      color: #64748b;
      padding: 12px 10px 4px 10px;
      letter-spacing: 0.8px;
      white-space: nowrap;
    }
    
    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 9px 12px;
      border-radius: 14px;
      color: #e2e8f0;
      text-decoration: none;
      font-size: 14.5px;
      font-weight: 600;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      white-space: nowrap;
    }
    .nav-item:hover {
      background: rgba(255, 255, 255, 0.06);
      color: #ffffff;
      transform: translateX(2px);
    }

    /* ACTIVE ITEM: CRISP WHITE PILL LIKE SCREENSHOT */
    .nav-item.active {
      background: #f8fafc;
      color: #0f172a !important;
      border-radius: 9999px;
      box-shadow: 0 4px 18px rgba(255, 255, 255, 0.18);
      font-weight: 700;
    }
    .nav-item.active .nav-chevron {
      color: #64748b;
    }

    /* COLORFUL SQUIRCLE ICONS */
    .icon-badge {
      width: 36px;
      height: 36px;
      min-width: 36px;
      border-radius: 11px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
      transition: transform 0.2s;
    }
    .nav-item:hover .icon-badge {
      transform: scale(1.05);
    }
    
    /* Specific squircle colors */
    .badge-blue    { background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: #fff; }
    .badge-cyan    { background: linear-gradient(135deg, #0ea5e9, #0284c7); color: #fff; }
    .badge-purple  { background: linear-gradient(135deg, #a855f7, #7e22ce); color: #fff; }
    .badge-violet  { background: linear-gradient(135deg, #6366f1, #4338ca); color: #fff; }
    .badge-teal    { background: linear-gradient(135deg, #14b8a6, #0f766e); color: #fff; }
    .badge-orange  { background: linear-gradient(135deg, #f97316, #ea580c); color: #fff; }
    .badge-pink    { background: linear-gradient(135deg, #ec4899, #be185d); color: #fff; }
    .badge-emerald { background: linear-gradient(135deg, #10b981, #047857); color: #fff; }
    .badge-slate   { background: linear-gradient(135deg, #64748b, #475569); color: #fff; }
    .badge-yellow  { background: linear-gradient(135deg, #eab308, #ca8a04); color: #fff; }

    .nav-text {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      letter-spacing: -0.2px;
    }
    .nav-chevron {
      font-size: 18px;
      color: rgba(255, 255, 255, 0.25);
      margin-left: auto;
      font-weight: 300;
      transition: transform 0.2s;
    }
    .nav-item:hover .nav-chevron {
      color: rgba(255, 255, 255, 0.7);
      transform: translateX(2px);
    }

    /* EMPTY SEARCH STATE */
    .nav-empty-search {
      display: none;
      padding: 24px 16px;
      text-align: center;
      font-size: 12.5px;
      color: #64748b;
    }

    /* 4. LIVE STATUS PANEL */
    .status-panel-full {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 12px;
      padding: 10px 12px;
      margin-bottom: 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .status-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11.5px;
    }
    .status-item-label {
      color: #94a3b8;
    }
    .status-chip {
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 10.5px;
      font-weight: 700;
    }
    .chip-online { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .chip-offline { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
    .mode-advisor { background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); }
    .mode-closer  { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .mode-friend  { background: rgba(236, 72, 153, 0.15); color: #f472b6; border: 1px solid rgba(236, 72, 153, 0.3); }

    /* Compact Status Dots */
    .status-panel-compact {
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 8px 0;
    }
    .compact-status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      box-shadow: 0 0 8px currentColor;
    }

    /* 5. SIDEBAR FOOTER & USER PROFILE CARD */
    .sidebar-footer {
      padding: 12px 14px 16px 14px;
      border-top: 1px solid var(--sidebar-border);
      background: #090c12;
    }
    .user-profile-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 6px 4px;
      border-radius: 12px;
      transition: background 0.2s;
    }
    .user-profile-left {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .user-avatar-circle {
      width: 38px;
      height: 38px;
      min-width: 38px;
      border-radius: 50%;
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #000000;
      font-weight: 800;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 10px rgba(245, 158, 11, 0.35);
    }
    .user-info-meta {
      min-width: 0;
    }
    .user-meta-name {
      font-size: 13.5px;
      font-weight: 800;
      color: #ffffff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      letter-spacing: 0.3px;
    }
    .user-meta-email {
      font-size: 11px;
      color: #94a3b8;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .btn-user-exit {
      width: 34px;
      height: 34px;
      min-width: 34px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #94a3b8;
      display: flex;
      align-items: center;
      justify-content: center;
      text-decoration: none;
      transition: all 0.2s;
    }
    .btn-user-exit:hover {
      background: rgba(239, 68, 68, 0.2);
      border-color: rgba(239, 68, 68, 0.4);
      color: #f87171;
      transform: scale(1.05);
    }

    /* MAIN CONTENT WRAPPER */
    .main-wrapper {
      margin-left: var(--sidebar-width);
      flex: 1;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      background: var(--bg-dark);
      transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      width: 100%;
      min-width: 0;
    }

    /* TOPBAR */
    .topbar {
      height: var(--topbar-height);
      background: #0d121c;
      border-bottom: 1px solid var(--sidebar-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 24px;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .topbar-left {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .topbar-title {
      font-size: 16.5px;
      font-weight: 700;
      color: #ffffff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }

    .btn-topbar {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #cbd5e1;
      border-radius: 8px;
      padding: 6px 12px;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      text-decoration: none;
      transition: all 0.2s;
    }
    .btn-topbar:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff;
    }
    .btn-topbar-danger {
      color: #f87171;
      border-color: rgba(239, 68, 68, 0.3);
    }
    .btn-topbar-danger:hover {
      background: rgba(239, 68, 68, 0.2);
    }

    .mobile-menu-btn {
      display: none;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: white;
      font-size: 18px;
      padding: 6px 10px;
      border-radius: 8px;
      cursor: pointer;
    }

    .content-area {
      padding: 24px;
      flex: 1;
      min-width: 0;
    }

    /* TOOLTIPS FOR COMPACT SIDEBAR */
    body.minimized-sidebar .nav-item:hover::after {
      content: attr(data-tooltip);
      position: absolute;
      left: calc(var(--sidebar-compact-width) + 8px);
      top: 50%;
      transform: translateY(-50%);
      background: #0f172a;
      border: 1px solid #38bdf8;
      color: white;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      z-index: 1000;
      box-shadow: 0 4px 15px rgba(0,0,0,0.5);
      pointer-events: none;
    }

    /* RESPONSIVE BREAKPOINTS */
    @media (max-width: 900px) {
      .sidebar {
        transform: translateX(-100%);
        width: 280px !important;
      }
      .sidebar.open {
        transform: translateX(0);
      }
      .sidebar-close-mobile {
        display: block;
      }
      .btn-collapse-sidebar {
        display: none !important;
      }
      .main-wrapper {
        margin-left: 0 !important;
      }
      .mobile-menu-btn {
        display: block;
      }
      .content-area {
        padding: 16px 12px;
      }
      .topbar {
        padding: 0 14px;
      }
      .topbar-title {
        font-size: 15px;
      }
    }
  </style>
  ${extraHead}
</head>
<body>
  <!-- MOBILE BACKDROP OVERLAY -->
  <div class="sidebar-backdrop" id="sidebarBackdrop" onclick="closeSidebar()"></div>

  <!-- LEFT SIDEBAR -->
  <aside class="sidebar" id="sidebarNav">
    <div>
      <!-- 1. BRAND HEADER -->
      <div class="sidebar-header">
        <a href="/leads" class="brand-link" title="BWB PANEL Home">
          <div class="brand-logo-badge">
            <div class="brand-logo-icon">
              <!-- BWB PANEL modern blue/green brand SVG -->
              <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" rx="8" fill="#10b981"/>
                <path d="M16 6C10.48 6 6 10.48 6 16C6 17.85 6.51 19.58 7.39 21.08L6 26L11.08 24.64C12.54 25.49 14.22 26 16 26C21.52 26 26 21.52 26 16C26 10.48 21.52 6 16 6Z" fill="white"/>
                <path d="M13.2 11.2C13 10.75 12.8 10.74 12.5 10.73C12.25 10.72 11.97 10.72 11.7 10.72C11.42 10.72 10.97 10.82 10.6 11.22C10.23 11.62 9.17 12.63 9.17 14.67C9.17 16.71 10.66 18.68 10.87 18.96C11.08 19.24 13.78 23.4 17.92 25.18C21.36 26.66 22.06 26.37 22.81 26.3C23.56 26.23 25.24 25.3 25.59 24.31C25.94 23.32 25.94 22.47 25.83 22.29C25.72 22.11 25.44 22.01 25.02 21.8C24.6 21.59 22.52 20.57 22.14 20.43C21.76 20.29 21.48 20.22 21.2 20.64C20.92 21.06 20.12 22.01 19.88 22.29C19.64 22.57 19.39 22.61 18.97 22.4C18.55 22.19 17.2 21.75 15.6 20.32C14.35 19.21 13.51 17.84 13.27 17.42C13.03 17 13.24 16.78 13.45 16.57C13.64 16.38 13.87 16.08 14.08 15.84C14.29 15.6 14.36 15.42 14.5 15.14C14.64 14.86 14.57 14.62 14.47 14.41C14.36 14.2 13.45 11.96 13.2 11.2Z" fill="#10b981"/>
              </svg>
            </div>
          </div>
          <div class="brand-title">BWB PANEL</div>
        </a>
        <button class="btn-collapse-sidebar" id="sidebarCollapseBtn" onclick="toggleSidebarMinimize()" title="Collapse / Expand Sidebar">
          <!-- Sidebar Toggle Window Icon from screenshot -->
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="9" y1="3" x2="9" y2="21"></line>
            <polyline points="15 9 12 12 15 15"></polyline>
          </svg>
        </button>
        <button class="sidebar-close-mobile" onclick="closeSidebar()" title="Close Navigation">✕</button>
      </div>

      <!-- 2. INSTANT LIVE SEARCH INPUT -->
      <div class="sidebar-search-box">
        <div class="search-input-wrap">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input 
            type="text" 
            id="sidebarMenuSearch" 
            class="sidebar-search-input" 
            placeholder="Search menu..." 
            oninput="handleMenuFilter(this.value)" 
            autocomplete="off"
          />
        </div>
      </div>

      <!-- 3. NAVIGATION MENU -->
      <nav class="nav-menu" id="sidebarNavMenu">
        
        <!-- DASHBOARD / LEADS CRM -->
        <a href="/leads" class="nav-item ${activeNav === 'leads' ? 'active' : ''}" data-tooltip="Dashboard & Leads CRM" data-keywords="dashboard leads crm pipeline customers">
          <div class="icon-badge badge-blue">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
          </div>
          <span class="nav-text">Dashboard</span>
          <span class="nav-chevron">›</span>
        </a>

        <!-- LIVE UNIFIED INBOX -->
        <a href="/inbox" class="nav-item ${activeNav === 'inbox' ? 'active' : ''}" data-tooltip="Live Unified Inbox" data-keywords="inbox chat messages live whatsapp omnichannel">
          <div class="icon-badge badge-cyan">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
            </svg>
          </div>
          <span class="nav-text">Inbox</span>
          <span class="nav-chevron">›</span>
        </a>

        <!-- CAMPAIGNS & MODES -->
        <a href="/campaigns" class="nav-item ${activeNav === 'campaigns' ? 'active' : ''}" data-tooltip="Campaigns & Modes" data-keywords="campaigns modes broadcast sales closer advisor friend">
          <div class="icon-badge badge-purple">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </div>
          <span class="nav-text">Campaigns</span>
          <span class="nav-chevron">›</span>
        </a>

        <!-- AI TRAINING STUDIO -->
        <a href="/training" class="nav-item ${activeNav === 'training' ? 'active' : ''}" data-tooltip="AI Training Studio" data-keywords="ai training studio knowledge brain prompts qa custom topic">
          <div class="icon-badge badge-violet">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2a4 4 0 0 0-4 4v1H7a3 3 0 0 0-3 3v2a3 3 0 0 0 2 2.83V16a5 5 0 0 0 5 5h2a5 5 0 0 0 5-5v-1.17A3 3 0 0 0 20 12v-2a3 3 0 0 0-3-3h-1V6a4 4 0 0 0-4-4z"></path>
              <circle cx="9" cy="11" r="1"></circle>
              <circle cx="15" cy="11" r="1"></circle>
            </svg>
          </div>
          <span class="nav-text">AI Training Studio</span>
          <span class="nav-chevron">›</span>
        </a>

        <!-- GROUPS & 1-MIN DRIP -->
        <a href="/groups" class="nav-item ${activeNav === 'groups' ? 'active' : ''}" data-tooltip="Groups & 1-Min Drip" data-keywords="groups drip scheduler automation members blast">
          <div class="icon-badge badge-teal">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          <span class="nav-text">Groups & Drip</span>
          <span class="nav-chevron">›</span>
        </a>

        <!-- WHATSAPP WEB QR -->
        <a href="/qr" class="nav-item ${activeNav === 'qr' ? 'active' : ''}" data-tooltip="WhatsApp Web QR" data-keywords="whatsapp web qr scan connect device login">
          <div class="icon-badge badge-orange">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
              <line x1="14" y1="14" x2="14" y2="14.01"></line>
              <line x1="18" y1="14" x2="21" y2="14"></line>
              <line x1="14" y1="18" x2="14" y2="21"></line>
              <line x1="18" y1="18" x2="21" y2="21"></line>
            </svg>
          </div>
          <span class="nav-text">Lead Source & QR</span>
          <span class="nav-chevron">›</span>
        </a>

        <!-- CHANNELS & SETTINGS -->
        <a href="/channels" class="nav-item ${activeNav === 'channels' ? 'active' : ''}" data-tooltip="Channels & Settings" data-keywords="channels settings api webhook facebook telegram instagram config">
          <div class="icon-badge badge-slate">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </div>
          <span class="nav-text">Channels & APIs</span>
          <span class="nav-chevron">›</span>
        </a>

        <!-- EXPORT LEADS CSV -->
        <a href="/download/leads.csv" class="nav-item" data-tooltip="Export Leads CSV" data-keywords="export leads csv download excel contacts report">
          <div class="icon-badge badge-emerald">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </div>
          <span class="nav-text">Export Leads CSV</span>
          <span class="nav-chevron">›</span>
        </a>

        <!-- NO SEARCH RESULTS FOUND -->
        <div class="nav-empty-search" id="navEmptySearch">
          🔍 No matching menu found
        </div>

      </nav>
    </div>

    <!-- 4. SIDEBAR FOOTER (STATUS + USER PROFILE) -->
    <div class="sidebar-footer">
      <!-- Live Status Panel -->
      <div class="status-panel-full">
        <div class="status-item">
          <span class="status-item-label">WhatsApp Live:</span>
          <span class="status-chip ${isConnected ? 'chip-online' : 'chip-offline'}">
            ${isConnected ? '🟢 Online' : '🔴 Disconnected'}
          </span>
        </div>
        <div class="status-item">
          <span class="status-item-label">Bot Mode:</span>
          <span class="status-chip ${modeBadgeClass}">
            ${modeLabel}
          </span>
        </div>
      </div>

      <!-- Compact Status Dots (for minimized desktop state) -->
      <div class="status-panel-compact">
        <div class="compact-status-dot" style="background:${isConnected ? '#10b981' : '#f87171'};" title="WhatsApp: ${isConnected ? 'Online' : 'Disconnected'}"></div>
        <div class="compact-status-dot" style="background:${currentMode === 'sales_closer' ? '#10b981' : currentMode === 'personal_human' ? '#ec4899' : '#a855f7'};" title="Bot Mode: ${modeLabel}"></div>
      </div>

      <!-- User Profile Card (Screenshot Match: BISWAJIT EKKA / mmmbsc2021@gmail.com / Exit) -->
      <div class="user-profile-card">
        <div class="user-profile-left">
          <div class="user-avatar-circle">B</div>
          <div class="user-info-meta">
            <div class="user-meta-name">BISWAJIT EKKA</div>
            <div class="user-meta-email">mmmbsc2021@gmail.com</div>
          </div>
        </div>
        <a href="/logout" class="btn-user-exit" title="Sign Out">
          <!-- Exit Icon from screenshot -->
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
        </a>
      </div>
    </div>
  </aside>

  <!-- MAIN WRAPPER -->
  <div class="main-wrapper">
    <div class="topbar">
      <div class="topbar-left">
        <button class="mobile-menu-btn" onclick="openSidebar()" title="Toggle Menu">☰</button>
        <div class="topbar-title">${title}</div>
      </div>

      <div class="topbar-actions">
        <span class="btn-topbar" style="cursor:default; background:transparent; border-color:rgba(255,255,255,0.08); color:#94a3b8;">
          👤 biswa342
        </span>
        <button onclick="location.reload()" class="btn-topbar" title="Reload page">
          🔄 Refresh
        </button>
        <a href="/logout" class="btn-topbar btn-topbar-danger" title="Sign out of system">
          🚪 Logout
        </a>
      </div>
    </div>

    <div class="content-area">
      ${contentHtml}
    </div>
  </div>

  <script>
    // 1. Mobile Sidebar Drawer Logic
    function openSidebar() {
      document.getElementById('sidebarNav').classList.add('open');
      document.getElementById('sidebarBackdrop').classList.add('active');
    }

    function closeSidebar() {
      document.getElementById('sidebarNav').classList.remove('open');
      document.getElementById('sidebarBackdrop').classList.remove('active');
    }

    // 2. Desktop Sidebar Minimize / Expand Logic
    function toggleSidebarMinimize() {
      const isMinimized = document.body.classList.toggle('minimized-sidebar');
      localStorage.setItem('wabapanel_sidebar_minimized', isMinimized ? 'true' : 'false');
    }

    // Restore user minimize preference on load
    (function initSidebarPreference() {
      const savedPref = localStorage.getItem('wabapanel_sidebar_minimized');
      if (savedPref === 'true' && window.innerWidth > 900) {
        document.body.classList.add('minimized-sidebar');
      }
    })();

    // 3. Instant Live Search Filter for Menu Items
    function handleMenuFilter(query) {
      const q = (query || '').toLowerCase().trim();
      const items = document.querySelectorAll('#sidebarNavMenu .nav-item');
      const emptyState = document.getElementById('navEmptySearch');
      let visibleCount = 0;

      items.forEach(item => {
        const text = (item.querySelector('.nav-text')?.innerText || '').toLowerCase();
        const keywords = (item.getAttribute('data-keywords') || '').toLowerCase();
        if (!q || text.includes(q) || keywords.includes(q)) {
          item.style.display = 'flex';
          visibleCount++;
        } else {
          item.style.display = 'none';
        }
      });

      if (emptyState) {
        emptyState.style.display = visibleCount === 0 ? 'block' : 'none';
      }
    }
  </script>
</body>
</html>
  `;
}

module.exports = {
  renderSidebarLayout
};
