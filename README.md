# 🎫 Discord Ticket Bot

A powerful Discord ticket bot inspired by [TicketKing](https://ticketking.xyz/). Built with Discord.js v14 and SQLite.

## ✨ Features

- **Unlimited Ticket Panels** with customizable embeds
- **Button-based ticket creation** with multiple categories
- **Modal Forms** - Ask questions before opening tickets
- **Ticket Management** - Close, claim, add/remove users
- **HTML Transcripts** - Save ticket conversations
- **Logging System** - Track all ticket actions
- **Role-based permissions** - Support team access

## 🚀 Quick Start

### 1. Create Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create New Application
3. Go to "Bot" → "Add Bot"
4. Enable these Privileged Intents:
   - **SERVER MEMBERS INTENT**
   - **MESSAGE CONTENT INTENT**
5. Copy the Bot Token

### 2. Install & Configure

```bash
# Clone/download the bot
cd ticketbot

# Install dependencies
npm install

# Create .env file
cp .env.example .env
```

Edit `.env` with your credentials:
```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
GUILD_ID=your_test_guild_id_here  # Optional, for faster command updates
```

### 3. Deploy Commands

```bash
npm run deploy
```

### 4. Start the Bot

```bash
npm start
```

## 📋 Commands

### Setup Commands
| Command | Description |
|---------|-------------|
| `/setup category` | Set ticket category |
| `/setup logs` | Set log channel |
| `/setup transcripts` | Set transcript channel |
| `/setup support-role` | Add support team role |
| `/setup view` | View current config |

### Panel Commands
| Command | Description |
|---------|-------------|
| `/panel create` | Create new panel |
| `/panel add-button` | Add button to panel |
| `/panel add-question` | Add form question |
| `/panel send` | Send panel to channel |
| `/panel list` | List all panels |
| `/panel info` | View panel details |
| `/panel delete` | Delete a panel |

### Ticket Commands
| Command | Description |
|---------|-------------|
| `/ticket close` | Close ticket |
| `/ticket add` | Add user to ticket |
| `/ticket remove` | Remove user |
| `/ticket rename` | Rename channel |
| `/ticket info` | View ticket info |

### Other Commands
| Command | Description |
|---------|-------------|
| `/help` | Show all commands |
| `/stats` | View statistics |

## 🛠️ Setup Guide

### Step 1: Configure Ticket Category
```
/setup category category:#Tickets
```

### Step 2: Set Log Channel
```
/setup logs channel:#ticket-logs
```

### Step 3: Set Transcript Channel
```
/setup transcripts channel:#transcripts
```

### Step 4: Add Support Role
```
/setup support-role role:@Support
```

### Step 5: Create a Panel
```
/panel create name:Support title:"🎫 Support Tickets" description:"Click below to open a ticket!"
```

### Step 6: Add Buttons
```
/panel add-button panel-id:1 label:"General Support" emoji:💬 prefix:support
/panel add-button panel-id:1 label:"Bug Report" emoji:🐛 prefix:bug
```

### Step 7: Add Questions (Optional)
```
/panel add-question button-id:1 question:"What is your issue?" placeholder:"Describe your problem..."
```

### Step 8: Send Panel
```
/panel send panel-id:1 channel:#create-ticket
```

## 📁 Project Structure

```
ticketbot/
├── src/
│   ├── index.js           # Bot entry point
│   ├── config.js          # Configuration
│   ├── deploy-commands.js # Command deployment
│   ├── commands/          # Slash commands
│   │   ├── help.js
│   │   ├── panel.js
│   │   ├── setup.js
│   │   ├── stats.js
│   │   └── ticket.js
│   ├── events/            # Event handlers
│   │   ├── guildCreate.js
│   │   ├── interactionCreate.js
│   │   └── ready.js
│   ├── handlers/          # Core logic
│   │   └── ticketHandler.js
│   └── database/          # Database
│       └── db.js
├── data/                  # SQLite database
├── .env                   # Environment variables
├── .env.example           # Example env file
├── .gitignore
├── package.json
└── README.md
```

## 🔧 Requirements

- Node.js 18+
- Discord Bot Token
- SQLite (included via better-sqlite3)

## 📄 License

MIT License - Free to use and modify

---

**Inspired by [TicketKing](https://ticketking.xyz/)** 🎫
