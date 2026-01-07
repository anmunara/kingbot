# 🚀 KingBot Deployment Guide - Ubuntu

## Prerequisites
- Ubuntu 20.04+ server
- Node.js 18+ installed
- Domain (optional, for HTTPS)

---

## Step 1: Transfer Files

Upload project ke server (via SFTP/SCP):
```bash
# Dari Windows, pakai SCP atau upload via File Manager hosting
scp -r ./ticketbot user@your-server-ip:/home/user/
```

---

## Step 2: Install Dependencies

```bash
# SSH ke server
ssh user@your-server-ip

# Masuk folder project
cd /home/user/ticketbot

# Install dependencies
npm install --production
```

---

## Step 3: Setup Environment

```bash
# Copy template
cp .env.example .env

# Edit dengan nano atau vim
nano .env
```

**Isi yang WAJIB:**
```env
WEB_PORT=3000
JWT_SECRET=ganti-dengan-random-string-panjang-32-karakter
SESSION_SECRET=ganti-dengan-random-string-lain-32-karakter

# Audit Log (buat webhook di Discord)
AUDIT_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/yyy

# Backup (opsional)
DISCORD_BACKUP_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/yyy
```

---

## Step 4: Setup PM2 (Process Manager)

```bash
# Install PM2
npm install -g pm2

# Start app
pm2 start web/server.js --name kingbot

# Auto-restart on reboot
pm2 startup
pm2 save
```

**PM2 Commands:**
```bash
pm2 status          # Lihat status
pm2 logs kingbot    # Lihat logs
pm2 restart kingbot # Restart
pm2 stop kingbot    # Stop
```

---

## Step 5: Setup Nginx (Reverse Proxy + HTTPS)

```bash
# Install Nginx
sudo apt install nginx -y

# Buat config
sudo nano /etc/nginx/sites-available/kingbot
```

**Isi config:**
```nginx
server {
    listen 80;
    server_name yourdomain.com;  # Ganti dengan domain

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/kingbot /etc/nginx/sites-enabled/

# Test config
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

---

## Step 6: Setup SSL (HTTPS) - FREE

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com

# Auto-renew (sudah otomatis)
```

---

## Step 7: Firewall

```bash
# Allow ports
sudo ufw allow 22      # SSH
sudo ufw allow 80      # HTTP
sudo ufw allow 443     # HTTPS
sudo ufw enable
```

---

## ✅ Checklist Deployment

- [ ] Files uploaded ke server
- [ ] `npm install` selesai
- [ ] `.env` sudah diisi
- [ ] PM2 running (`pm2 status` shows online)
- [ ] Nginx configured & running
- [ ] SSL/HTTPS aktif
- [ ] Firewall enabled
- [ ] Bisa akses via browser

---

## Troubleshooting

**Bot tidak start?**
```bash
pm2 logs kingbot --lines 50
```

**Database error?**
```bash
# Pastikan folder data ada dan writable
mkdir -p web/data
chmod 755 web/data
```

**Port 3000 sudah dipakai?**
```bash
# Ganti port di .env
WEB_PORT=3001
```
