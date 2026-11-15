const express = require('express');
const router = express.Router();
const authService = require('../services/authService');

// Login Page UI
router.get('/login', (req, res) => {
  // If already authenticated, redirect straight to dashboard
  const cookies = authService.parseCookies(req.headers.cookie);
  const token = cookies[authService.AUTH_CONFIG.cookieName];
  if (authService.verifySessionToken(token)) {
    return res.redirect(req.query.redirect || '/groups');
  }

  const redirectUrl = req.query.redirect || '/groups';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login • BWB Media Growth Suite</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: radial-gradient(circle at 50% 20%, #1e293b 0%, #0b1120 70%, #050811 100%);
      color: #f8fafc;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .login-container {
      width: 100%;
      max-width: 440px;
      perspective: 1000px;
    }

    .login-card {
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: 20px;
      padding: 38px 32px;
      backdrop-filter: blur(16px);
      box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 35px rgba(2, 132, 199, 0.15);
      position: relative;
      overflow: hidden;
    }

    .login-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: -50%;
      width: 200%;
      height: 2px;
      background: linear-gradient(90deg, transparent, #38bdf8, #0284c7, transparent);
      animation: scanline 4s linear infinite;
    }

    @keyframes scanline {
      0% { transform: translateX(0); }
      100% { transform: translateX(50%); }
    }

    .brand-header {
      text-align: center;
      margin-bottom: 28px;
    }

    .brand-logo {
      width: 58px;
      height: 58px;
      margin: 0 auto 14px auto;
      background: linear-gradient(135deg, #0284c7, #38bdf8);
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 30px;
      font-weight: 800;
      color: white;
      box-shadow: 0 8px 25px rgba(2, 132, 199, 0.5);
    }

    .brand-title {
      font-size: 22px;
      font-weight: 800;
      color: white;
      letter-spacing: 0.5px;
    }

    .brand-sub {
      font-size: 12px;
      color: #38bdf8;
      text-transform: uppercase;
      letter-spacing: 2px;
      font-weight: 700;
      margin-top: 4px;
    }

    .login-desc {
      font-size: 13px;
      color: #94a3b8;
      margin-top: 10px;
    }

    .form-group {
      margin-bottom: 20px;
      text-align: left;
    }

    .form-label {
      display: block;
      font-size: 12.5px;
      font-weight: 600;
      color: #cbd5e1;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    .input-icon {
      position: absolute;
      left: 14px;
      font-size: 16px;
      color: #64748b;
      pointer-events: none;
    }

    .form-control {
      width: 100%;
      padding: 13px 44px 13px 42px;
      background: #090e1a;
      border: 1px solid #334155;
      border-radius: 10px;
      color: white;
      font-size: 14.5px;
      outline: none;
      transition: all 0.25s;
    }

    .form-control:focus {
      border-color: #38bdf8;
      box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2);
      background: #0b1120;
    }

    .toggle-pass {
      position: absolute;
      right: 14px;
      background: none;
      border: none;
      color: #94a3b8;
      font-size: 16px;
      cursor: pointer;
      padding: 4px;
      transition: color 0.2s;
    }

    .toggle-pass:hover {
      color: #38bdf8;
    }

    .alert-box {
      display: none;
      padding: 12px 14px;
      border-radius: 10px;
      background: rgba(220, 38, 38, 0.15);
      border: 1px solid #ef4444;
      color: #fca5a5;
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 20px;
      text-align: center;
    }

    .shake {
      animation: shake 0.4s ease-in-out;
    }

    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      20%, 60% { transform: translateX(-8px); }
      40%, 80% { transform: translateX(8px); }
    }

    .remember-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      font-size: 13px;
      color: #94a3b8;
    }

    .remember-label {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }

    .remember-label input {
      accent-color: #0284c7;
      cursor: pointer;
      width: 15px;
      height: 15px;
    }

    .btn-login {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #0284c7, #2563eb);
      color: white;
      border: none;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.5px;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(2, 132, 199, 0.4);
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }

    .btn-login:hover {
      background: linear-gradient(135deg, #0369a1, #1d4ed8);
      box-shadow: 0 6px 20px rgba(2, 132, 199, 0.6);
      transform: translateY(-1px);
    }

    .btn-login:active {
      transform: translateY(0);
    }

    .btn-login:disabled {
      opacity: 0.65;
      cursor: not-allowed;
    }

    .card-footer {
      text-align: center;
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px solid #1e293b;
      font-size: 12px;
      color: #64748b;
    }

    .card-footer span {
      color: #38bdf8;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="login-container">
    <div class="login-card" id="loginCard">
      <div class="brand-header">
        <div class="brand-logo">B</div>
        <div class="brand-title">BWB MEDIA</div>
        <div class="brand-sub">Growth Suite v2.0</div>
        <div class="login-desc">Sign in with your secure credentials to manage automation</div>
      </div>

      <div class="alert-box" id="errorAlert"></div>

      <form id="loginForm" onsubmit="handleLogin(event)">
        <input type="hidden" id="redirectInput" value="${redirectUrl}">

        <div class="form-group">
          <label class="form-label" for="username">User ID (UID)</label>
          <div class="input-wrapper">
            <span class="input-icon">👤</span>
            <input 
              type="text" 
              id="username" 
              class="form-control" 
              placeholder="Enter your UID" 
              required 
              autocomplete="username"
              autofocus
            >
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="password">Password</label>
          <div class="input-wrapper">
            <span class="input-icon">🔒</span>
            <input 
              type="password" 
              id="password" 
              class="form-control" 
              placeholder="Enter your password" 
              required 
              autocomplete="current-password"
            >
            <button type="button" class="toggle-pass" onclick="togglePasswordVisibility()" title="Show/Hide Password">
              <span id="eyeIcon">👁️</span>
            </button>
          </div>
        </div>

        <div class="remember-row">
          <label class="remember-label">
            <input type="checkbox" id="rememberMe" checked>
            <span>Remember this device</span>
          </label>
          <span style="font-size: 11px; color:#38bdf8;">🔐 256-bit Encrypted</span>
        </div>

        <button type="submit" class="btn-login" id="submitBtn">
          <span id="btnText">Sign In to Dashboard →</span>
        </button>
      </form>

      <div class="card-footer">
        Protected 24/7 Automation & Marketing Engine • <span>BWB Media</span>
      </div>
    </div>
  </div>

  <script>
    function togglePasswordVisibility() {
      const pass = document.getElementById('password');
      const eye = document.getElementById('eyeIcon');
      if (pass.type === 'password') {
        pass.type = 'text';
        eye.innerText = '🙈';
      } else {
        pass.type = 'password';
        eye.innerText = '👁️';
      }
    }

    async function handleLogin(e) {
      e.preventDefault();
      const usernameInput = document.getElementById('username');
      const passwordInput = document.getElementById('password');
      const redirect = document.getElementById('redirectInput').value || '/groups';
      const submitBtn = document.getElementById('submitBtn');
      const btnText = document.getElementById('btnText');
      const alertBox = document.getElementById('errorAlert');
      const card = document.getElementById('loginCard');

      alertBox.style.display = 'none';
      card.classList.remove('shake');

      submitBtn.disabled = true;
      btnText.innerText = 'Verifying credentials...';

      try {
        const res = await fetch('/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: usernameInput.value.trim(),
            password: passwordInput.value,
            redirect
          })
        });

        const data = await res.json();

        if (data.success) {
          btnText.innerText = '✅ Access Granted! Redirecting...';
          submitBtn.style.background = '#059669';
          window.location.href = data.redirect || redirect;
        } else {
          alertBox.innerText = data.error || 'Invalid credentials. Please try again.';
          alertBox.style.display = 'block';
          card.classList.add('shake');
          passwordInput.value = '';
          passwordInput.focus();
          submitBtn.disabled = false;
          btnText.innerText = 'Sign In to Dashboard →';
        }
      } catch (err) {
        alertBox.innerText = 'Connection error. Please check server status.';
        alertBox.style.display = 'block';
        submitBtn.disabled = false;
        btnText.innerText = 'Sign In to Dashboard →';
      }
    }
  </script>
</body>
</html>
  `;

  res.send(html);
});

// Process Login API
router.post('/login', (req, res) => {
  const { username, password, redirect } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'UID and Password are required.' });
  }

  const isValid = authService.validateCredentials(username, password);

  if (!isValid) {
    return res.status(401).json({ success: false, error: 'Incorrect UID or Password. Access denied.' });
  }

  // Create session token
  const token = authService.createSessionToken(username);

  // Set secure HTTP-only cookie
  res.cookie(authService.AUTH_CONFIG.cookieName, token, {
    httpOnly: true,
    maxAge: authService.AUTH_CONFIG.maxAgeSeconds * 1000,
    sameSite: 'lax',
    path: '/'
  });

  return res.json({
    success: true,
    message: 'Login successful!',
    redirect: redirect || '/groups'
  });
});

// Logout handler
router.all('/logout', (req, res) => {
  res.clearCookie(authService.AUTH_CONFIG.cookieName, { path: '/' });
  return res.redirect('/login');
});

module.exports = router;
