# 躺平足球3D - 部署指南

## 文件说明
- `football.html` — 游戏前端页面
- `server.js` — 服务器（房间管理+登录认证+聊天好友+邮件通知）
- `package.json` — Node.js 依赖配置

## 本地运行
```bash
npm install
node server.js
```
然后浏览器打开 http://localhost:3000

## Render 部署步骤

### 1. 推送到 GitHub
将这三个文件推送到你的 GitHub 仓库（可新建一个仓库）。

### 2. 在 Render 创建 Web Service
1. 登录 https://render.com
2. 点击 **New +** → **Web Service**
3. 连接你的 GitHub 仓库
4. 配置如下：
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: Free（免费版即可）

### 3. 添加环境变量
在 Render 的 **Environment** 页面添加以下变量：

| 变量名 | 说明 | 示例（QQ邮箱） |
|--------|------|----------------|
| SMTP_HOST | SMTP 服务器地址 | smtp.qq.com |
| SMTP_PORT | SMTP 端口 | 465 |
| SMTP_USER | 发件邮箱地址 | your@qq.com |
| SMTP_PASS | 邮箱授权码（非登录密码） | xxxxxxxxxxxxxxxx |
| SMTP_FROM | 发件人地址 | your@qq.com |
| ADMIN_EMAIL | 接收游客登录通知的邮箱 | your@qq.com |

> QQ邮箱获取授权码：QQ邮箱 → 设置 → 账户 → POP3/SMTP服务 → 开启 → 获取授权码

### 4. 部署
点击 Create Web Service，等待部署完成。
部署成功后会得到一个地址如 `https://your-app.onrender.com`，浏览器打开即可远程联机玩。

## 功能说明
- **登录**：昵称 + 密码（昵称唯一，不可重复）
- **注册**：昵称 + 密码 + 邮箱
- **忘记密码**：输入邮箱 → 接收验证码 → 重置密码
- **跳过登录**：游客模式可直接玩游戏，但无法使用聊天和好友功能；跳过时会发邮件通知站长
- **联机**：创建房间分享房间号，好友加入即可远程对战
