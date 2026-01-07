import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure data directory exists
const dataDir = join(__dirname, 'data');
try { mkdirSync(dataDir, { recursive: true }); } catch (e) { }

const dbPath = join(dataDir, 'database.sqlite');
export const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Initialize database schema
db.exec(`
  -- ========================
  -- SaaS Platform Tables
  -- ========================

  -- Platform Users (website accounts)
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    username TEXT,
    is_admin INTEGER DEFAULT 0,
    is_approved INTEGER DEFAULT 1,
    is_banned INTEGER DEFAULT 0,
    max_bots INTEGER DEFAULT 2,
    invited_by INTEGER,
    invite_code_used TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invited_by) REFERENCES users(id)
  );

  -- Invite Codes for Registration
  CREATE TABLE IF NOT EXISTS invite_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    created_by INTEGER NOT NULL,
    used_by INTEGER,
    max_uses INTEGER DEFAULT 1,
    uses_count INTEGER DEFAULT 0,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (used_by) REFERENCES users(id)
  );

  -- User's Bots
  CREATE TABLE IF NOT EXISTS bots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    bot_token TEXT NOT NULL,
    client_id TEXT,
    bot_name TEXT,
    bot_avatar TEXT,
    status TEXT DEFAULT 'stopped',
    error_message TEXT,
    guilds_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- ========================
  -- Bot-specific Tables
  -- ========================

  -- Guild configuration (linked to bot)
  CREATE TABLE IF NOT EXISTS guilds (
    id TEXT NOT NULL,
    bot_id INTEGER NOT NULL,
    log_channel_id TEXT,
    transcript_channel_id TEXT,
    ticket_category_id TEXT,
    support_role_ids TEXT DEFAULT '[]',
    admin_role_ids TEXT DEFAULT '[]',
    ticket_counter INTEGER DEFAULT 0,
    language TEXT DEFAULT 'en',
    timezone TEXT DEFAULT 'UTC',
    auto_close_hours INTEGER DEFAULT 0,
    auto_close_warning_hours INTEGER DEFAULT 0,
    PRIMARY KEY (id, bot_id),
    FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
  );

  -- Ticket Panels
  CREATE TABLE IF NOT EXISTS panels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id INTEGER NOT NULL,
    guild_id TEXT NOT NULL,
    channel_id TEXT,
    message_id TEXT,
    name TEXT NOT NULL,
    embed_title TEXT,
    embed_description TEXT,
    embed_color TEXT DEFAULT '#5865F2',
    embed_image TEXT,
    embed_thumbnail TEXT,
    embed_footer TEXT,
    embed_author_name TEXT,
    embed_author_icon TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
  );

  -- Panel Options (Buttons)
  CREATE TABLE IF NOT EXISTS panel_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    panel_id INTEGER NOT NULL,
    label TEXT NOT NULL,
    emoji TEXT,
    style TEXT DEFAULT 'Primary',
    category_name TEXT,
    ticket_prefix TEXT DEFAULT 'ticket',
    support_role_ids TEXT DEFAULT '[]',
    welcome_message TEXT,
    ticket_message TEXT,
    staff_thread_message TEXT,
    steam_required INTEGER DEFAULT 0,
    pings_enabled INTEGER DEFAULT 1,
    is_disabled INTEGER DEFAULT 0,
    ticket_style TEXT DEFAULT 'channel',
    required_roles TEXT DEFAULT '[]',
    FOREIGN KEY (panel_id) REFERENCES panels(id) ON DELETE CASCADE
  );

  -- Panel Questions (Modal forms)
  CREATE TABLE IF NOT EXISTS panel_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    option_id INTEGER NOT NULL,
    question TEXT NOT NULL,
    placeholder TEXT,
    required INTEGER DEFAULT 1,
    min_length INTEGER DEFAULT 1,
    max_length INTEGER DEFAULT 1000,
    style TEXT DEFAULT 'Paragraph',
    position INTEGER DEFAULT 0,
    FOREIGN KEY (option_id) REFERENCES panel_options(id) ON DELETE CASCADE
  );

  -- Tickets
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id INTEGER NOT NULL,
    guild_id TEXT NOT NULL,
    channel_id TEXT UNIQUE,
    user_id TEXT NOT NULL,
    panel_id INTEGER,
    option_id INTEGER,
    ticket_number INTEGER NOT NULL,
    status TEXT DEFAULT 'open',
    claimed_by TEXT,
    opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    closed_by TEXT,
    close_reason TEXT,
    transcript_url TEXT,
    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
    first_response_at DATETIME,
    response_time_seconds INTEGER,
    warned_auto_close INTEGER DEFAULT 0,
    FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE,
    FOREIGN KEY (panel_id) REFERENCES panels(id) ON DELETE SET NULL,
    FOREIGN KEY (option_id) REFERENCES panel_options(id) ON DELETE SET NULL
  );

  -- Ticket Form Responses
  CREATE TABLE IF NOT EXISTS ticket_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    question TEXT NOT NULL,
    response TEXT,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
  );

  -- Ticket Participants
  CREATE TABLE IF NOT EXISTS ticket_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    added_by TEXT,
    UNIQUE(ticket_id, user_id),
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
  );

  -- Steam Links
  CREATE TABLE IF NOT EXISTS steam_links (
    user_id TEXT PRIMARY KEY,
    steam_id TEXT NOT NULL,
    steam_name TEXT,
    linked_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Panel Templates
  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id INTEGER NOT NULL,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    panel_data TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
  );

  -- Custom Commands
  CREATE TABLE IF NOT EXISTS custom_commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bot_id INTEGER NOT NULL,
    guild_id TEXT NOT NULL,
    trigger TEXT NOT NULL,
    response TEXT,
    embed_title TEXT,
    embed_description TEXT,
    embed_color TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(bot_id, guild_id, trigger),
    FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
  );

  -- Welcome & Goodbye Settings
  CREATE TABLE IF NOT EXISTS guild_welcome_settings (
    guild_id TEXT PRIMARY KEY,
    bot_id INTEGER NOT NULL,
    welcome_enabled INTEGER DEFAULT 0,
    welcome_channel_id TEXT,
    welcome_message TEXT DEFAULT 'Welcome {USER} to {SERVER}!',
    goodbye_enabled INTEGER DEFAULT 0,
    goodbye_channel_id TEXT,
    goodbye_message TEXT DEFAULT '{USER} has left the server.',
    autorole_enabled INTEGER DEFAULT 0,
    autorole_id TEXT,
    FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
  );

  -- Embed Messages
  CREATE TABLE IF NOT EXISTS embeds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    bot_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    channel_id TEXT,
    content TEXT,
    title TEXT,
    description TEXT,
    color TEXT,
    image_url TEXT,
    thumbnail_url TEXT,
    footer_text TEXT,
    footer_icon_url TEXT,
    author_name TEXT,
    author_icon_url TEXT,
    author_url TEXT,
    title_url TEXT,
    timestamp BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
  );

  -- Invite Joins
  CREATE TABLE IF NOT EXISTS invite_joins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    inviter_id TEXT,
    code TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Sticky Messages
  CREATE TABLE IF NOT EXISTS sticky_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL UNIQUE,
    content TEXT NOT NULL,
    last_message_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Create indexes
  CREATE INDEX IF NOT EXISTS idx_bots_user ON bots(user_id);
  CREATE INDEX IF NOT EXISTS idx_guilds_bot ON guilds(bot_id);
  CREATE INDEX IF NOT EXISTS idx_panels_bot ON panels(bot_id);
  CREATE INDEX IF NOT EXISTS idx_tickets_bot ON tickets(bot_id);
  CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
`);

try {
  db.prepare("ALTER TABLE panels ADD COLUMN message_content TEXT").run();
} catch (e) {
  // Column likely exists
}

try {
  db.prepare("ALTER TABLE panels ADD COLUMN embed_title_url TEXT").run();
} catch (e) { /* Column likely exists */ }

try {
  db.prepare("ALTER TABLE panels ADD COLUMN embed_author_url TEXT").run();
} catch (e) { /* Column likely exists */ }

try {
  db.prepare("ALTER TABLE panels ADD COLUMN embed_footer_icon TEXT").run();
} catch (e) { /* Column likely exists */ }

try {
  db.prepare("ALTER TABLE panel_options ADD COLUMN is_disabled INTEGER DEFAULT 0").run();
} catch (e) { /* Column likely exists */ }

try {
  db.prepare("ALTER TABLE panel_options ADD COLUMN ticket_style TEXT DEFAULT 'channel'").run();
} catch (e) { /* Column likely exists */ }

try {
  db.prepare("ALTER TABLE panel_options ADD COLUMN required_roles TEXT DEFAULT '[]'").run();
} catch (e) { /* Column likely exists */ }

try {
  db.prepare("ALTER TABLE panel_options ADD COLUMN ticket_category_id TEXT").run();
} catch (e) { /* Column likely exists */ }

try {
  db.prepare("ALTER TABLE tickets ADD COLUMN messages TEXT").run();
} catch (e) { /* Column likely exists */ }

// ========================
// Welcome Operations
// ========================

try {
  db.prepare("ALTER TABLE guild_welcome_settings ADD COLUMN welcome_card_enabled INTEGER DEFAULT 0").run();
} catch (e) { /* Column likely exists */ }

try {
  db.prepare("ALTER TABLE guild_welcome_settings ADD COLUMN card_background TEXT").run();
} catch (e) { /* Column likely exists */ }

try {
  db.prepare("ALTER TABLE guild_welcome_settings ADD COLUMN card_font TEXT DEFAULT 'Inter'").run();
} catch (e) { /* Column likely exists */ }

try {
  db.prepare("ALTER TABLE guild_welcome_settings ADD COLUMN card_text_color TEXT DEFAULT '#ffffff'").run();
} catch (e) { /* Column likely exists */ }

try {
  db.prepare("ALTER TABLE guild_welcome_settings ADD COLUMN card_bg_color TEXT DEFAULT '#000000'").run();
} catch (e) { /* Column likely exists */ }

try {
  db.prepare("ALTER TABLE guild_welcome_settings ADD COLUMN card_overlay_opacity REAL DEFAULT 0.5").run();
} catch (e) { /* Column likely exists */ }

export const getWelcomeSettings = db.prepare(`
  SELECT * FROM guild_welcome_settings WHERE guild_id = ? AND bot_id = ?
`);

export const saveWelcomeSettings = db.prepare(`
  INSERT INTO guild_welcome_settings (
    guild_id, bot_id, 
    welcome_enabled, welcome_channel_id, welcome_message, 
    goodbye_enabled, goodbye_channel_id, goodbye_message, 
    autorole_enabled, autorole_id,
    welcome_card_enabled, card_background, card_font, card_text_color, card_bg_color, card_overlay_opacity
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(guild_id) DO UPDATE SET
    welcome_enabled = excluded.welcome_enabled,
    welcome_channel_id = excluded.welcome_channel_id,
    welcome_message = excluded.welcome_message,
    goodbye_enabled = excluded.goodbye_enabled,
    goodbye_channel_id = excluded.goodbye_channel_id,
    goodbye_message = excluded.goodbye_message,
    autorole_enabled = excluded.autorole_enabled,
    autorole_id = excluded.autorole_id,
    welcome_card_enabled = excluded.welcome_card_enabled,
    card_background = excluded.card_background,
    card_font = excluded.card_font,
    card_text_color = excluded.card_text_color,
    card_bg_color = excluded.card_bg_color,
    card_overlay_opacity = excluded.card_overlay_opacity
`);

// ========================
// User Operations
// ========================

export const getUserByEmail = db.prepare(`
  SELECT * FROM users WHERE email = ?
`);

export const getUserById = db.prepare(`
  SELECT id, email, username, is_admin, is_approved, is_banned, max_bots, created_at FROM users WHERE id = ?
`);

export const createUser = db.prepare(`
  INSERT INTO users (email, password_hash, username, invite_code_used, invited_by)
  VALUES (?, ?, ?, ?, ?)
`);

export const updateUser = db.prepare(`
  UPDATE users SET is_approved = ?, is_banned = ?, max_bots = ? WHERE id = ?
`);

export const makeUserAdmin = db.prepare(`
  UPDATE users SET is_admin = 1 WHERE id = ?
`);

export const getAllUsers = db.prepare(`
  SELECT u.id, u.email, u.username, u.is_admin, u.is_approved, u.is_banned, u.max_bots, u.created_at,
         (SELECT COUNT(*) FROM bots WHERE user_id = u.id) as bots_count
  FROM users u ORDER BY u.created_at DESC
`);

export const deleteUser = db.prepare(`
  DELETE FROM users WHERE id = ?
`);

// ========================
// Invite Code Operations
// ========================

export const createInviteCode = db.prepare(`
  INSERT INTO invite_codes (code, created_by, max_uses, expires_at)
  VALUES (?, ?, ?, ?)
`);

export const getInviteCode = db.prepare(`
  SELECT * FROM invite_codes WHERE code = ?
`);

export const getAllInviteCodes = db.prepare(`
  SELECT ic.*, u.username as created_by_name
  FROM invite_codes ic
  LEFT JOIN users u ON ic.created_by = u.id
  ORDER BY ic.created_at DESC
`);

export const useInviteCode = db.prepare(`
  UPDATE invite_codes SET uses_count = uses_count + 1 WHERE code = ?
`);

export const deleteInviteCode = db.prepare(`
  DELETE FROM invite_codes WHERE id = ?
`);

// ========================
// Bot Operations
// ========================

export const createBot = db.prepare(`
  INSERT INTO bots (user_id, bot_token, client_id, bot_name, bot_avatar) 
  VALUES (?, ?, ?, ?, ?)
`);

export const getBot = db.prepare(`
  SELECT * FROM bots WHERE id = ?
`);

export const getBotsByUser = db.prepare(`
  SELECT id, user_id, client_id, bot_name, bot_avatar, status, error_message, guilds_count, created_at 
  FROM bots WHERE user_id = ?
`);

export const getBotWithToken = db.prepare(`
  SELECT * FROM bots WHERE id = ? AND user_id = ?
`);

export const getBotsByStatus = db.prepare(`
  SELECT * FROM bots WHERE status = ?
`);

export const updateBotStatus = db.prepare(`
  UPDATE bots SET status = ?, error_message = ? WHERE id = ?
`);

export const updateBotPresence = db.prepare(`
  UPDATE bots SET activity_type = ?, activity_name = ?, status_presence = ? WHERE id = ?
`);

export const updateBotInfo = db.prepare(`
  UPDATE bots SET bot_name = ?, bot_avatar = ?, client_id = ?, guilds_count = ? WHERE id = ?
`);

export const deleteBot = db.prepare(`
  DELETE FROM bots WHERE id = ? AND user_id = ?
`);

// ========================
// Guild Operations (scoped to bot)
// ========================

export const getGuild = db.prepare(`
  SELECT * FROM guilds WHERE id = ? AND bot_id = ?
`);

export const upsertGuild = db.prepare(`
  INSERT INTO guilds (id, bot_id) VALUES (?, ?)
  ON CONFLICT(id, bot_id) DO NOTHING
`);

// Whitelist of allowed columns for guild settings (SQL Injection Prevention)
const ALLOWED_GUILD_COLUMNS = [
  'language', 'timezone', 'ticket_counter', 'log_channel_id', 'archive_category_id',
  'open_category_id', 'claims_enabled', 'ticket_limit', 'dm_enabled', 'steam_check_enabled',
  'steam_role_id', 'welcome_channel_id', 'welcome_message', 'welcome_embed', 'leave_channel_id',
  'leave_message', 'leave_embed', 'vouch_channel_id', 'vouch_data', 'auto_close_enabled',
  'auto_close_hours', 'auto_close_message', 'transcript_channel_id'
];

export const updateGuildSetting = (guildId, botId, column, value) => {
  // Security: Validate column name against whitelist to prevent SQL injection
  if (!ALLOWED_GUILD_COLUMNS.includes(column)) {
    throw new Error(`Invalid column name: ${column}`);
  }
  const stmt = db.prepare(`UPDATE guilds SET ${column} = ? WHERE id = ? AND bot_id = ?`);
  return stmt.run(value, guildId, botId);
};

export const getNextTicketNumber = (guildId, botId) => {
  const stmt = db.prepare(`
    UPDATE guilds SET ticket_counter = ticket_counter + 1 
    WHERE id = ? AND bot_id = ?
    RETURNING ticket_counter
  `);
  const result = stmt.get(guildId, botId);
  return result?.ticket_counter || 1;
};

// ========================
// Panel Operations (scoped to bot)
// ========================

export const createPanel = db.prepare(`
  INSERT INTO panels (bot_id, guild_id, name, embed_title, embed_description, embed_color, embed_image, embed_thumbnail, embed_footer, embed_author_name, embed_author_icon, message_content, embed_title_url, embed_author_url, embed_footer_icon)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

export const getPanel = db.prepare(`SELECT * FROM panels WHERE id = ?`);

export const getPanelsByGuild = db.prepare(`
  SELECT * FROM panels WHERE guild_id = ? AND bot_id = ?
`);

export const getPanelsByBot = db.prepare(`
  SELECT * FROM panels WHERE bot_id = ?
`);

export const deletePanel = db.prepare(`DELETE FROM panels WHERE id = ?`);

export const updatePanelMessage = db.prepare(`
  UPDATE panels SET channel_id = ?, message_id = ? WHERE id = ?
`);

export const updatePanel = db.prepare(`
  UPDATE panels SET 
    name = ?,
    embed_title = ?,
    embed_description = ?,
    embed_color = ?,
    message_content = ?,
    embed_author_name = ?,
    embed_footer = ?,
    embed_image = ?,
    embed_thumbnail = ?,
    embed_author_icon = ?,
    embed_title_url = ?,
    embed_author_url = ?,
    embed_footer_icon = ?
  WHERE id = ?
`);

// ========================
// Panel Options
// ========================

export const createPanelOption = db.prepare(`
  INSERT INTO panel_options (panel_id, label, emoji, style, category_name, ticket_prefix, support_role_ids, welcome_message, is_disabled, ticket_style, required_roles, ticket_message, staff_thread_message, steam_required, pings_enabled, ticket_category_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

export const getPanelOptions = db.prepare(`
  SELECT * FROM panel_options WHERE panel_id = ?
`);

export const getPanelOption = db.prepare(`SELECT * FROM panel_options WHERE id = ?`);
export const deletePanelOption = db.prepare(`DELETE FROM panel_options WHERE id = ?`);
export const deletePanelOptions = db.prepare(`DELETE FROM panel_options WHERE panel_id = ?`);


// ========================
// Questions
// ========================

export const createQuestion = db.prepare(`
  INSERT INTO panel_questions (option_id, question, placeholder, required, min_length, max_length, style, position)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

export const getQuestionsByOption = db.prepare(`
  SELECT * FROM panel_questions WHERE option_id = ? ORDER BY position ASC
`);

export const deleteQuestion = db.prepare(`DELETE FROM panel_questions WHERE id = ?`);

// ========================
// Ticket Operations
// ========================

export const createTicket = db.prepare(`
  INSERT INTO tickets (bot_id, guild_id, channel_id, user_id, panel_id, option_id, ticket_number)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

export const getTicket = db.prepare(`SELECT * FROM tickets WHERE id = ?`);
export const getTicketByChannel = db.prepare(`SELECT * FROM tickets WHERE channel_id = ?`);

export const getOpenTicketByUser = db.prepare(`
  SELECT * FROM tickets WHERE bot_id = ? AND guild_id = ? AND user_id = ? AND option_id = ? AND status = 'open'
`);

export const getTicketsByGuild = db.prepare(`
  SELECT * FROM tickets WHERE guild_id = ? AND bot_id = ? ORDER BY opened_at DESC LIMIT ? OFFSET ?
`);

export const getTicketsByBot = db.prepare(`
  SELECT * FROM tickets WHERE bot_id = ? ORDER BY opened_at DESC LIMIT ? OFFSET ?
`);

export const getOpenTicketsCount = db.prepare(`
  SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND bot_id = ? AND status = 'open'
`);

export const closeTicket = db.prepare(`
  UPDATE tickets SET status = 'closed', closed_at = CURRENT_TIMESTAMP, closed_by = ?, close_reason = ?
  WHERE id = ?
`);

export const claimTicket = db.prepare(`
  UPDATE tickets SET claimed_by = ? WHERE id = ?
`);

export const updateTicketTranscript = db.prepare(`
  UPDATE tickets SET transcript_url = ? WHERE id = ?
`);

export const saveTicketMessages = db.prepare(`
  UPDATE tickets SET messages = ? WHERE id = ?
`);

// ========================
// Statistics
// ========================

export const getTicketStats = db.prepare(`
  SELECT 
    COUNT(*) as total_tickets,
    SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_tickets,
    SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_tickets,
    AVG(response_time_seconds) as avg_response_time
  FROM tickets 
  WHERE bot_id = ?
`);

export const getGuildStats = db.prepare(`
  SELECT 
    COUNT(*) as total_tickets,
    SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_tickets,
    SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_tickets
  FROM tickets 
  WHERE guild_id = ? AND bot_id = ?
`);

export const getTicketActivity = db.prepare(`
  SELECT 
    strftime('%Y-%m-%d', opened_at) as date,
    COUNT(*) as count
  FROM tickets 
  WHERE guild_id = ? AND bot_id = ? AND opened_at >= ?
  GROUP BY date
  ORDER BY date ASC
`);

// ========================
// Custom Commands
// ========================

export const getCustomCommandsByGuild = db.prepare(`
  SELECT * FROM custom_commands WHERE guild_id = ? AND bot_id = ?
`);

export const getCustomCommand = db.prepare(`
  SELECT * FROM custom_commands WHERE guild_id = ? AND bot_id = ? AND trigger = ?
`);

export const createCustomCommand = db.prepare(`
  INSERT INTO custom_commands (bot_id, guild_id, trigger, response, embed_title, embed_description, embed_color, created_by)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

export const updateCustomCommand = db.prepare(`
  UPDATE custom_commands SET trigger = ?, response = ?, embed_title = ?, embed_description = ?, embed_color = ?
  WHERE id = ?
`);

export const deleteCustomCommand = db.prepare(`
  DELETE FROM custom_commands WHERE id = ?
`);

// ========================
// Embed Messages
// ========================

export const getEmbedsByGuild = db.prepare(`
  SELECT * FROM embeds WHERE guild_id = ? AND bot_id = ? ORDER BY created_at DESC
`);

export const getEmbed = db.prepare(`
  SELECT * FROM embeds WHERE id = ? AND guild_id = ? AND bot_id = ?
`);

export const createEmbed = db.prepare(`
  INSERT INTO embeds (
    guild_id, bot_id, name, channel_id, content, title, description, color,
    image_url, thumbnail_url, footer_text, footer_icon_url,
    author_name, author_icon_url, author_url, title_url, timestamp
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

export const updateEmbed = db.prepare(`
  UPDATE embeds SET
    name = ?, channel_id = ?, content = ?, title = ?, description = ?, color = ?,
    image_url = ?, thumbnail_url = ?, footer_text = ?, footer_icon_url = ?,
    author_name = ?, author_icon_url = ?, author_url = ?, title_url = ?, timestamp = ?
  WHERE id = ? AND guild_id = ? AND bot_id = ?
`);

export const deleteEmbed = db.prepare(`
  DELETE FROM embeds WHERE id = ? AND guild_id = ? AND bot_id = ?
`);

// ========================
// Templates
// ========================

export const createTemplate = db.prepare(`
  INSERT INTO templates (bot_id, guild_id, name, panel_data) VALUES (?, ?, ?, ?)
`);

export const getTemplatesByGuild = db.prepare(`
  SELECT * FROM templates WHERE guild_id = ? AND bot_id = ?
`);

export const getTemplate = db.prepare(`
  SELECT * FROM templates WHERE id = ?
`);

export const deleteTemplate = db.prepare(`
  DELETE FROM templates WHERE id = ?
`);

export default db;

