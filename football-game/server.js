/**
 * 躺平足球3D - 游戏服务器
 * 功能：房间管理 + 昵称密码认证 + 忘记密码(邮箱验证码) + 聊天好友系统 + 跳过登录通知
 *
 * 部署环境变量（Render）:
 *   - PORT: 监听端口，默认3000
 *   - SMTP_HOST: SMTP服务器地址
 *   - SMTP_PORT: SMTP端口
 *   - SMTP_USER: SMTP用户名
 *   - SMTP_PASS: SMTP密码
 *   - SMTP_FROM: 发件人地址
 *   - ADMIN_EMAIL: 站长邮箱（接收游客登录通知）
 *
 * 注意：所有数据存储在内存中，服务器重启后清空
 */

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const nodemailer = require('nodemailer');

// ========== 环境变量 ==========
const PORT = process.env.PORT || 3000;
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: process.env.SMTP_SECURE !== 'false', // 默认SSL
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  from: process.env.SMTP_FROM,
};
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';

// 检查SMTP配置是否完整
const smtpConfigured = !!(SMTP_CONFIG.host && SMTP_CONFIG.user && SMTP_CONFIG.pass && SMTP_CONFIG.from);

if (!smtpConfigured) {
  console.warn('⚠️  [警告] SMTP 邮箱服务未配置，验证码邮件和通知邮件将无法发送');
  console.warn('    请设置环境变量: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM');
}
if (!ADMIN_EMAIL) {
  console.warn('⚠️  [警告] ADMIN_EMAIL 未配置，游客登录通知将只记录到日志');
}

// ========== 邮件传输器 ==========
let transporter = null;
if (smtpConfigured) {
  transporter = nodemailer.createTransport({
    host: SMTP_CONFIG.host,
    port: SMTP_CONFIG.port,
    secure: SMTP_CONFIG.secure,
    auth: {
      user: SMTP_CONFIG.user,
      pass: SMTP_CONFIG.pass,
    },
  });
}

/**
 * 发送HTML邮件
 */
async function sendMail(to, subject, html) {
  if (!transporter) {
    console.log(`📧 [邮件未配置] 拟发送到 ${to}: ${subject}`);
    return false;
  }
  try {
    await transporter.sendMail({
      from: SMTP_CONFIG.from,
      to: to,
      subject: subject,
      html: html,
    });
    console.log(`📧 邮件已发送至 ${to}: ${subject}`);
    return true;
  } catch (err) {
    console.error(`📧 邮件发送失败 (${to}):`, err.message);
    return false;
  }
}

/**
 * 生成验证码邮件HTML
 */
function buildVerifyCodeEmail(code, expiresMinutes = 5) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: "Microsoft YaHei", Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 30px; }
    .container { max-width: 500px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 40px 30px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .header { text-align: center; margin-bottom: 30px; }
    .logo { font-size: 28px; font-weight: bold; color: #1976d2; }
    .subtitle { color: #666; font-size: 14px; margin-top: 8px; }
    .title { font-size: 18px; color: #333; text-align: center; margin-bottom: 20px; }
    .code-box {
      background: linear-gradient(135deg, #e3f2fd, #bbdefb);
      border-radius: 10px;
      padding: 25px;
      text-align: center;
      margin: 25px 0;
    }
    .code {
      font-size: 42px;
      font-weight: bold;
      letter-spacing: 12px;
      color: #1565c0;
      font-family: "Courier New", monospace;
    }
    .tip { color: #888; font-size: 13px; text-align: center; margin-top: 10px; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #aaa; font-size: 12px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">⚽ 躺平足球3D</div>
      <div class="subtitle">FlatFootball3D</div>
    </div>
    <div class="title">您的登录验证码</div>
    <div class="code-box">
      <div class="code">${code}</div>
    </div>
    <div class="tip">
      验证码有效期 <strong>${expiresMinutes} 分钟</strong>，请勿泄露给他人。<br>
      如非本人操作，请忽略此邮件。
    </div>
    <div class="footer">
      本邮件由躺平足球3D自动发送，请勿直接回复
    </div>
  </div>
</body>
</html>`;
}

/**
 * 生成游客登录通知邮件HTML
 */
function buildGuestNotifyEmail(info) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: "Microsoft YaHei", Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 30px; }
    .container { max-width: 520px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 30px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .header { font-size: 20px; font-weight: bold; color: #ff9800; margin-bottom: 20px; border-left: 4px solid #ff9800; padding-left: 12px; }
    .info-table { width: 100%; border-collapse: collapse; }
    .info-table td { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
    .info-table td:first-child { color: #888; width: 100px; }
    .info-table td:last-child { color: #333; word-break: break-all; }
    .footer { margin-top: 20px; color: #aaa; font-size: 12px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">📢 游客登录通知</div>
    <table class="info-table">
      <tr><td>临时ID</td><td>${info.tempId || '-'}</td></tr>
      <tr><td>昵称</td><td>${info.nickname || '-'}</td></tr>
      <tr><td>IP地址</td><td>${info.ip || '-'}</td></tr>
      <tr><td>访问时间</td><td>${info.time || '-'}</td></tr>
      <tr><td>User-Agent</td><td>${info.userAgent || '-'}</td></tr>
    </table>
    <div class="footer">躺平足球3D 服务器自动通知</div>
  </div>
</body>
</html>`;
}

// ========== 内存数据存储 ==========
// 用户表: Map<userId, { userId, nickname, password, email, createdAt }>
const users = new Map();
// 昵称索引: Map<nickname, userId>
const nicknameIndex = new Map();
// 邮箱索引: Map<email, userId>
const emailIndex = new Map();

// 重置密码验证码存储: Map<email, { code, expiresAt, lastSentAt }>
const verifyCodes = new Map();
// 注册验证码存储: Map<email, { code, nickname, password, expiresAt, lastSentAt }>
const registerCodes = new Map();

// 在线用户: Map<socketId, { userId, nickname, socket }>
const onlineUsers = new Map();
// userId -> socketId 映射
const userIdToSocket = new Map();

// 好友关系: Map<userId, Set<friendUserId>>
const friendships = new Map();
// 好友申请: Map<requestId, { requestId, fromUserId, fromNickname, toUserId, message, createdAt }>
const friendRequests = new Map();

// 房间管理: Map<roomId, { roomId, hostId, players: Map<socketId, { id, slot, name, ready }>, gameStarted }>
const rooms = new Map();

// ========== 工具函数 ==========
function genId(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

function gen6DigitCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function getClientIp(socket) {
  return (socket.handshake.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || socket.handshake.address
    || 'unknown';
}

function getUserAgent(socket) {
  return socket.handshake.headers['user-agent'] || 'unknown';
}

// ========== Express 应用 ==========
const app = express();
const server = http.createServer(app);

// 静态文件：提供 football.html
app.use(express.static(path.join(__dirname)));

// 根路径直接返回游戏页面
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'football.html'));
});

// ========== Socket.IO ==========
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});

io.on('connection', (socket) => {
  const ip = getClientIp(socket);
  const userAgent = getUserAgent(socket);
  console.log(`🔌 新连接: ${socket.id} (IP: ${ip})`);

  // 当前socket关联的用户
  let currentUserId = null;
  let currentNickname = '';
  let currentRoomId = null;

  // ============================================================
  // 认证相关事件
  // ============================================================

  // 发送注册验证码
  socket.on('send_register_code', async (data) => {
    try {
      const { nickname, password, email } = data || {};
      if (!nickname || !password || !email) {
        socket.emit('register_error', { message: '请填写所有字段' });
        return;
      }
      if (nickname.length < 2 || nickname.length > 20) {
        socket.emit('register_error', { message: '昵称长度需在2-20个字符之间' });
        return;
      }
      if (password.length < 6) {
        socket.emit('register_error', { message: '密码长度至少6位' });
        return;
      }
      // 邮箱格式校验
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        socket.emit('register_error', { message: '请输入有效的邮箱地址' });
        return;
      }
      // 昵称唯一性校验
      if (nicknameIndex.has(nickname)) {
        socket.emit('register_error', { message: '该昵称已被使用' });
        return;
      }
      // 邮箱唯一性校验
      const lowerEmail = email.toLowerCase();
      if (emailIndex.has(lowerEmail)) {
        socket.emit('register_error', { message: '该邮箱已被注册' });
        return;
      }

      // 检查60秒限制
      const now = Date.now();
      const existing = registerCodes.get(lowerEmail);
      if (existing && now - existing.lastSentAt < 60 * 1000) {
        socket.emit('register_error', { message: '请求过于频繁，请60秒后再试' });
        return;
      }

      // 生成6位验证码
      const code = gen6DigitCode();
      const expiresAt = now + 5 * 60 * 1000; // 5分钟有效

      // 发送邮件
      const sent = await sendMail(
        lowerEmail,
        '躺平足球3D - 注册验证码',
        buildVerifyCodeEmail(code, 5)
      );

      if (!sent && !smtpConfigured) {
        socket.emit('register_error', { message: '邮箱服务未配置，请联系管理员' });
        return;
      }
      if (!sent) {
        socket.emit('register_error', { message: '验证码发送失败，请稍后重试' });
        return;
      }

      // 存储验证码（包含注册信息，供注册时使用）
      registerCodes.set(lowerEmail, {
        code,
        nickname,
        password,
        expiresAt,
        lastSentAt: now,
      });

      console.log(`📝 注册验证码已发送至 ${maskEmail(lowerEmail)}`);
      socket.emit('register_code_sent', { email: maskEmail(email) });
    } catch (err) {
      console.error('发送注册验证码异常:', err);
      socket.emit('register_error', { message: '验证码发送失败，请稍后重试' });
    }
  });

  // 注册（需验证码）
  socket.on('register', async (data) => {
    try {
      const { nickname, password, email, code } = data || {};
      if (!nickname || !password || !email || !code) {
        socket.emit('register_error', { message: '请填写所有字段' });
        return;
      }
      const lowerEmail = email.toLowerCase();
      const stored = registerCodes.get(lowerEmail);
      if (!stored) {
        socket.emit('register_error', { message: '验证码错误或已过期' });
        return;
      }
      if (Date.now() > stored.expiresAt) {
        registerCodes.delete(lowerEmail);
        socket.emit('register_error', { message: '验证码已过期' });
        return;
      }
      if (stored.code !== code) {
        socket.emit('register_error', { message: '验证码错误' });
        return;
      }
      // 校验注册信息是否与发送验证码时一致
      if (stored.nickname !== nickname || stored.password !== password) {
        socket.emit('register_error', { message: '注册信息与验证码申请不一致' });
        return;
      }

      // 再次校验唯一性（防止并发情况）
      if (nicknameIndex.has(nickname)) {
        registerCodes.delete(lowerEmail);
        socket.emit('register_error', { message: '该昵称已被使用' });
        return;
      }
      if (emailIndex.has(lowerEmail)) {
        registerCodes.delete(lowerEmail);
        socket.emit('register_error', { message: '该邮箱已被注册' });
        return;
      }

      // 创建用户
      const userId = genId('u_');
      const user = {
        userId,
        nickname,
        password,
        email: lowerEmail,
        createdAt: Date.now(),
      };
      users.set(userId, user);
      nicknameIndex.set(nickname, userId);
      emailIndex.set(lowerEmail, userId);
      friendships.set(userId, new Set());

      // 清除验证码记录
      registerCodes.delete(lowerEmail);

      console.log(`👤 新用户注册: ${nickname} (${email})`);
      socket.emit('register_success', { userId, nickname });

      // 注册成功后自动登录
      doLogin(socket, user, () => { currentUserId = userId; currentNickname = nickname; });
    } catch (err) {
      console.error('注册异常:', err);
      socket.emit('register_error', { message: '注册失败，请稍后重试' });
    }
  });

  // 登录
  socket.on('login', (data) => {
    try {
      const { nickname, password } = data || {};
      if (!nickname || !password) {
        socket.emit('auth_error', { message: '请填写昵称和密码' });
        return;
      }
      const userId = nicknameIndex.get(nickname);
      if (!userId) {
        socket.emit('auth_error', { message: '昵称或密码错误' });
        return;
      }
      const user = users.get(userId);
      if (!user || user.password !== password) {
        socket.emit('auth_error', { message: '昵称或密码错误' });
        return;
      }
      doLogin(socket, user, () => { currentUserId = userId; currentNickname = user.nickname; });
    } catch (err) {
      console.error('登录异常:', err);
      socket.emit('auth_error', { message: '登录失败，请稍后重试' });
    }
  });

  // 发送重置密码验证码
  socket.on('send_reset_code', async (data) => {
    try {
      const { email } = data || {};
      if (!email) {
        socket.emit('verify_code_error', { message: '请输入邮箱地址' });
        return;
      }
      const lowerEmail = email.toLowerCase();
      const userId = emailIndex.get(lowerEmail);
      if (!userId) {
        // 为了安全，不告诉用户该邮箱是否注册过
        socket.emit('verify_code_sent', { email: maskEmail(email) });
        return;
      }

      // 检查60秒限制
      const now = Date.now();
      const existing = verifyCodes.get(lowerEmail);
      if (existing && now - existing.lastSentAt < 60 * 1000) {
        socket.emit('verify_code_error', { message: '验证码发送太频繁，请稍后再试' });
        return;
      }

      // 生成6位验证码
      const code = gen6DigitCode();
      const expiresAt = now + 5 * 60 * 1000; // 5分钟有效

      // 发送邮件
      const sent = await sendMail(
        lowerEmail,
        '躺平足球3D - 密码重置验证码',
        buildVerifyCodeEmail(code, 5)
      );

      if (!sent && !smtpConfigured) {
        socket.emit('verify_code_error', { message: '邮箱服务未配置，请联系管理员' });
        return;
      }
      if (!sent) {
        socket.emit('verify_code_error', { message: '验证码发送失败，请稍后重试' });
        return;
      }

      // 存储验证码
      verifyCodes.set(lowerEmail, { code, expiresAt, lastSentAt: now });

      console.log(`🔐 重置密码验证码已发送至 ${maskEmail(lowerEmail)}`);
      socket.emit('verify_code_sent', { email: maskEmail(email) });
    } catch (err) {
      console.error('发送验证码异常:', err);
      socket.emit('verify_code_error', { message: '验证码发送失败，请稍后重试' });
    }
  });

  // 重置密码
  socket.on('reset_password', (data) => {
    try {
      const { email, code, newPassword } = data || {};
      if (!email || !code || !newPassword) {
        socket.emit('reset_password_error', { message: '请填写所有字段' });
        return;
      }
      if (newPassword.length < 6) {
        socket.emit('reset_password_error', { message: '新密码长度至少6位' });
        return;
      }
      const lowerEmail = email.toLowerCase();
      const stored = verifyCodes.get(lowerEmail);
      if (!stored) {
        socket.emit('reset_password_error', { message: '验证码错误或已过期' });
        return;
      }
      if (Date.now() > stored.expiresAt) {
        verifyCodes.delete(lowerEmail);
        socket.emit('reset_password_error', { message: '验证码已过期' });
        return;
      }
      if (stored.code !== code) {
        socket.emit('reset_password_error', { message: '验证码错误' });
        return;
      }

      // 查找用户并更新密码
      const userId = emailIndex.get(lowerEmail);
      if (!userId) {
        socket.emit('reset_password_error', { message: '该邮箱未注册' });
        return;
      }
      const user = users.get(userId);
      if (user) {
        user.password = newPassword;
      }

      // 清除验证码
      verifyCodes.delete(lowerEmail);

      console.log(`🔑 密码重置成功: ${user ? user.nickname : lowerEmail}`);
      socket.emit('reset_password_success');
    } catch (err) {
      console.error('重置密码异常:', err);
      socket.emit('reset_password_error', { message: '密码重置失败，请稍后重试' });
    }
  });

  // 跳过登录（游客模式）
  socket.on('skip_login', async (data) => {
    try {
      const { tempId, nickname } = data || {};
      const guestId = tempId || ('guest_' + genId());
      const guestName = nickname || '游客';

      console.log(`👋 游客登录: ${guestName} (${guestId}, IP: ${ip})`);
      console.log(`   User-Agent: ${userAgent}`);

      // 发送通知给站长
      if (ADMIN_EMAIL && smtpConfigured) {
        const notifyInfo = {
          tempId: guestId,
          nickname: guestName,
          ip: ip,
          time: new Date().toLocaleString('zh-CN'),
          userAgent: userAgent,
        };
        sendMail(ADMIN_EMAIL, '【躺平足球3D】游客登录通知', buildGuestNotifyEmail(notifyInfo)).catch(() => {});
      } else {
        console.log(`📢 [站长通知] 游客 ${guestName} 访问 (IP: ${ip})`);
      }

      socket.emit('skip_notified', { tempId: guestId, nickname: guestName });
    } catch (err) {
      console.error('跳过登录异常:', err);
    }
  });

  // ============================================================
  // 执行登录（公共函数）
  // ============================================================
  function doLogin(sock, user, onSuccess) {
    const { userId, nickname } = user;

    // 如果该用户已在其他地方登录，先断开旧连接
    const oldSocketId = userIdToSocket.get(userId);
    if (oldSocketId && oldSocketId !== sock.id) {
      const oldSock = onlineUsers.get(oldSocketId);
      if (oldSock && oldSock.socket) {
        oldSock.socket.emit('auth_error', { message: '你的账号在其他地方登录了' });
        oldSock.socket.disconnect(true);
      }
      onlineUsers.delete(oldSocketId);
    }

    onlineUsers.set(sock.id, { userId, nickname, socket: sock });
    userIdToSocket.set(userId, sock.id);

    onSuccess && onSuccess();

    // 通知好友上线
    const myFriends = friendships.get(userId) || new Set();
    myFriends.forEach((friendId) => {
      const friendSocketId = userIdToSocket.get(friendId);
      if (friendSocketId) {
        io.to(friendSocketId).emit('user_online', { userId, nickname });
      }
    });

    // 广播在线用户（简化：只通知列表变化）
    broadcastOnlineUsers();

    sock.emit('auth_success', { userId, nickname });
    console.log(`✅ 用户登录: ${nickname} (${userId})`);
  }

  // ============================================================
  // 聊天与好友系统
  // ============================================================

  // 发送世界聊天消息
  socket.on('send_world_message', (data) => {
    if (!currentUserId) return;
    const { content } = data || {};
    if (!content || !content.trim()) return;
    const msg = {
      senderId: currentUserId,
      senderName: currentNickname,
      content: content.slice(0, 500),
      timestamp: Date.now(),
    };
    // 广播给所有在线用户
    io.emit('receive_world_message', msg);
  });

  // 发送私聊消息
  socket.on('send_private_message', (data) => {
    if (!currentUserId) return;
    const { receiverId, content } = data || {};
    if (!receiverId || !content || !content.trim()) return;
    const msg = {
      senderId: currentUserId,
      senderName: currentNickname,
      receiverId: receiverId,
      content: content.slice(0, 500),
      timestamp: Date.now(),
    };
    const receiverSocketId = userIdToSocket.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('receive_private_message', msg);
    }
    // 也发送给发送者自己（用于UI显示一致性）
    socket.emit('receive_private_message', msg);
  });

  // 获取好友列表
  socket.on('get_friends_list', () => {
    if (!currentUserId) return;
    const friendSet = friendships.get(currentUserId) || new Set();
    const friendList = [];
    friendSet.forEach((friendId) => {
      const friend = users.get(friendId);
      if (friend) {
        friendList.push({
          userId: friend.userId,
          nickname: friend.nickname,
          avatar: '',
          online: !!userIdToSocket.get(friendId),
        });
      }
    });
    socket.emit('friends_list', friendList);
  });

  // 搜索用户
  socket.on('search_user', (data) => {
    if (!currentUserId) return;
    const { nickname } = data || {};
    if (!nickname) return;
    const userId = nicknameIndex.get(nickname.trim());
    if (userId) {
      const user = users.get(userId);
      socket.emit('user_found', {
        userId: user.userId,
        nickname: user.nickname,
        online: !!userIdToSocket.get(userId),
      });
    } else {
      socket.emit('user_not_found');
    }
  });

  // 发送好友申请
  socket.on('send_friend_request', (data) => {
    if (!currentUserId) return;
    const { targetUserId, message } = data || {};
    if (!targetUserId || targetUserId === currentUserId) return;

    const targetUser = users.get(targetUserId);
    if (!targetUser) return;

    // 检查是否已是好友
    const myFriends = friendships.get(currentUserId) || new Set();
    if (myFriends.has(targetUserId)) return;

    // 生成申请ID
    const requestId = genId('fr_');
    friendRequests.set(requestId, {
      requestId,
      fromUserId: currentUserId,
      fromNickname: currentNickname,
      toUserId: targetUserId,
      message: message || '',
      createdAt: Date.now(),
    });

    // 通知对方
    const targetSocketId = userIdToSocket.get(targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('receive_friend_request', {
        requestId,
        fromUserId: currentUserId,
        fromNickname: currentNickname,
        message: message || '',
      });
    }
  });

  // 接受好友申请
  socket.on('accept_friend', (data) => {
    if (!currentUserId) return;
    const { requestId } = data || {};
    if (!requestId) return;
    const req = friendRequests.get(requestId);
    if (!req || req.toUserId !== currentUserId) return;

    // 建立双向好友关系
    const myFriends = friendships.get(currentUserId) || new Set();
    const otherFriends = friendships.get(req.fromUserId) || new Set();
    myFriends.add(req.fromUserId);
    otherFriends.add(currentUserId);
    friendships.set(currentUserId, myFriends);
    friendships.set(req.fromUserId, otherFriends);

    friendRequests.delete(requestId);

    const fromUser = users.get(req.fromUserId);
    const me = users.get(currentUserId);

    // 通知双方
    socket.emit('friend_request_accepted', {
      userId: req.fromUserId,
      nickname: fromUser ? fromUser.nickname : '',
    });
    const fromSocketId = userIdToSocket.get(req.fromUserId);
    if (fromSocketId) {
      io.to(fromSocketId).emit('friend_request_accepted', {
        userId: currentUserId,
        nickname: me ? me.nickname : '',
      });
    }

    console.log(`🤝 好友关系建立: ${currentNickname} ↔ ${req.fromNickname}`);
  });

  // 拒绝好友申请
  socket.on('reject_friend', (data) => {
    if (!currentUserId) return;
    const { requestId } = data || {};
    if (!requestId) return;
    const req = friendRequests.get(requestId);
    if (!req || req.toUserId !== currentUserId) return;

    friendRequests.delete(requestId);

    // 通知申请方
    const fromSocketId = userIdToSocket.get(req.fromUserId);
    if (fromSocketId) {
      io.to(fromSocketId).emit('friend_request_rejected', {
        targetUserId: currentUserId,
        targetNickname: currentNickname,
      });
    }
  });

  // 删除好友
  socket.on('remove_friend', (data) => {
    if (!currentUserId) return;
    const { friendId } = data || {};
    if (!friendId) return;

    const myFriends = friendships.get(currentUserId) || new Set();
    const otherFriends = friendships.get(friendId) || new Set();
    myFriends.delete(friendId);
    otherFriends.delete(currentUserId);
    friendships.set(currentUserId, myFriends);
    friendships.set(friendId, otherFriends);

    // 通知对方
    const otherSocketId = userIdToSocket.get(friendId);
    if (otherSocketId) {
      io.to(otherSocketId).emit('friends_list', getFriendList(friendId));
    }
  });

  // ============================================================
  // 房间管理（原有逻辑）
  // ============================================================

  // 创建房间
  socket.on('createRoom', (data) => {
    const { roomId, playerName } = data || {};
    const rid = roomId || genId('r_');
    if (rooms.has(rid)) {
      socket.emit('errorMsg', '房间号已存在');
      return;
    }
    const room = {
      roomId: rid,
      hostId: socket.id,
      players: new Map(),
      gameStarted: false,
    };
    room.players.set(socket.id, {
      id: socket.id,
      slot: 0,
      name: playerName || '房主',
      ready: true,
      isHost: true,
    });
    rooms.set(rid, room);
    currentRoomId = rid;
    socket.join(rid);
    socket.emit('joinedRoom', { slot: 0, isHost: true, roomId: rid });
    broadcastRoomUpdate(rid);
    console.log(`🏠 房间创建: ${rid} by ${playerName}`);
  });

  // 加入房间
  socket.on('joinRoom', (data) => {
    const { roomId, playerName } = data || {};
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('errorMsg', '房间不存在');
      return;
    }
    if (room.gameStarted) {
      socket.emit('errorMsg', '游戏已开始，无法加入');
      return;
    }
    if (room.players.size >= 2) {
      socket.emit('errorMsg', '房间已满');
      return;
    }
    const slot = 1;
    room.players.set(socket.id, {
      id: socket.id,
      slot: slot,
      name: playerName || '玩家',
      ready: false,
      isHost: false,
    });
    currentRoomId = roomId;
    socket.join(roomId);
    socket.emit('joinedRoom', { slot, isHost: false, roomId });
    broadcastRoomUpdate(roomId);
    console.log(`👤 加入房间: ${roomId} - ${playerName}`);
  });

  // 准备
  socket.on('ready', () => {
    const room = rooms.get(currentRoomId);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    player.ready = !player.ready;
    broadcastRoomUpdate(currentRoomId);
  });

  // 房主开始游戏
  socket.on('startGameByHost', () => {
    const room = rooms.get(currentRoomId);
    if (!room) return;
    if (room.hostId !== socket.id) return;
    if (room.players.size < 2) {
      socket.emit('errorMsg', '需要2名玩家才能开始');
      return;
    }
    // 检查所有人都已准备
    let allReady = true;
    room.players.forEach((p) => {
      if (!p.isHost && !p.ready) allReady = false;
    });
    if (!allReady) {
      socket.emit('errorMsg', '等待对方准备就绪');
      return;
    }
    room.gameStarted = true;
    io.to(currentRoomId).emit('startGame');
    console.log(`🎮 游戏开始: ${currentRoomId}`);
  });

  // 游戏状态同步（房主 -> 服务器 -> 其他玩家）
  socket.on('gameState', (data) => {
    const room = rooms.get(currentRoomId);
    if (!room || !room.gameStarted) return;
    if (room.hostId !== socket.id) return;
    // 转发给房间内其他人
    socket.to(currentRoomId).emit('gameState', data);
  });

  // 玩家输入
  socket.on('playerInput', (data) => {
    const room = rooms.get(currentRoomId);
    if (!room || !room.gameStarted) return;
    socket.to(currentRoomId).emit('playerInput', {
      id: socket.id,
      slot: data.slot,
      input: data.input,
    });
  });

  // 进球事件
  socket.on('goal', (data) => {
    const room = rooms.get(currentRoomId);
    if (!room || !room.gameStarted) return;
    if (room.hostId !== socket.id) return;
    io.to(currentRoomId).emit('goal', data);
  });

  // 断开连接
  socket.on('disconnect', () => {
    console.log(`🔌 断开连接: ${socket.id}`);

    // 处理房间
    if (currentRoomId) {
      const room = rooms.get(currentRoomId);
      if (room) {
        const wasHost = room.hostId === socket.id;
        room.players.delete(socket.id);

        if (room.players.size === 0) {
          // 房间空了，销毁
          rooms.delete(currentRoomId);
          console.log(`🏠 房间销毁: ${currentRoomId}`);
        } else {
          if (wasHost) {
            // 房主离开，转移给剩下的玩家
            const remaining = room.players.values().next().value;
            if (remaining) {
              room.hostId = remaining.id;
              remaining.isHost = true;
              remaining.ready = true;
            }
          }
          // 通知房间内其他玩家
          io.to(currentRoomId).emit('playerDisconnected', socket.id);
          room.gameStarted = false;
          broadcastRoomUpdate(currentRoomId);
        }
      }
      currentRoomId = null;
    }

    // 处理在线用户和好友
    if (currentUserId) {
      onlineUsers.delete(socket.id);
      userIdToSocket.delete(currentUserId);

      // 通知好友下线
      const myFriends = friendships.get(currentUserId) || new Set();
      myFriends.forEach((friendId) => {
        const friendSocketId = userIdToSocket.get(friendId);
        if (friendSocketId) {
          io.to(friendSocketId).emit('user_offline', { userId: currentUserId, nickname: currentNickname });
        }
      });

      broadcastOnlineUsers();
      console.log(`👋 用户下线: ${currentNickname} (${currentUserId})`);
      currentUserId = null;
      currentNickname = '';
    }
  });
});

// ========== 辅助函数 ==========

// 邮箱脱敏
function maskEmail(email) {
  const [name, domain] = email.split('@');
  if (!name || !domain) return email;
  const maskedName = name.length <= 2 ? name[0] + '*' : name[0] + '***' + name[name.length - 1];
  return maskedName + '@' + domain;
}

// 获取好友列表（简化版）
function getFriendList(userId) {
  const friendSet = friendships.get(userId) || new Set();
  const list = [];
  friendSet.forEach((fid) => {
    const u = users.get(fid);
    if (u) {
      list.push({
        userId: u.userId,
        nickname: u.nickname,
        avatar: '',
        online: !!userIdToSocket.get(fid),
      });
    }
  });
  return list;
}

// 广播房间更新
function broadcastRoomUpdate(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const players = [];
  room.players.forEach((p) => {
    players.push({ id: p.id, slot: p.slot, name: p.name, ready: p.ready, isHost: p.isHost });
  });
  io.to(roomId).emit('roomUpdate', players);
}

// 广播在线用户（给全体在线用户，用于好友列表状态更新）
function broadcastOnlineUsers() {
  const users = [];
  onlineUsers.forEach((u) => {
    users.push({ userId: u.userId, nickname: u.nickname });
  });
  // 这里不做全量广播，避免流量浪费；实际通过单播 user_online/user_offline 就够了
  // io.emit('online_users', users);
}

// ========== 启动服务器 ==========
server.listen(PORT, () => {
  console.log('');
  console.log('============================================');
  console.log('  ⚽  躺平足球3D - 服务器启动成功');
  console.log('============================================');
  console.log(`  端口: ${PORT}`);
  console.log(`  邮箱服务: ${smtpConfigured ? '已配置' : '未配置 ⚠️'}`);
  console.log(`  站长邮箱: ${ADMIN_EMAIL || '未配置 ⚠️'}`);
  console.log('');
  console.log('  环境变量说明:');
  console.log('    SMTP_HOST    - SMTP服务器地址');
  console.log('    SMTP_PORT    - SMTP端口（默认465）');
  console.log('    SMTP_USER    - SMTP用户名');
  console.log('    SMTP_PASS    - SMTP密码');
  console.log('    SMTP_FROM    - 发件人邮箱');
  console.log('    ADMIN_EMAIL  - 站长邮箱（接收游客通知）');
  console.log('    PORT         - 监听端口（默认3000）');
  console.log('============================================');
  console.log('');
});
