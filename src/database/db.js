import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '../../web/data/database.sqlite');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Schema is managed by web/database.js - no need to re-create here
// But we do need to ensure the column exists if the bot runs before the web dashboard updates it
try {
  db.prepare("ALTER TABLE tickets ADD COLUMN messages TEXT").run();
} catch (e) { /* Column likely exists */ }


// ===================
// Guild Operations
// ===================

export const getGuild = db.prepare(`
  SELECT * FROM guilds WHERE id = ? AND bot_id = ?
`);

export const upsertGuild = db.prepare(`
  INSERT INTO guilds (id, bot_id) VALUES (?, ?)
  ON CONFLICT(id, bot_id) DO NOTHING
`);

export const updateGuildSetting = (guildId, botId, column, value) => {
  const stmt = db.prepare(`UPDATE guilds SET ${column} = ? WHERE id = ? AND bot_id = ?`);
  return stmt.run(value, guildId, botId);
};

export const getNextTicketNumber = (guildId, botId) => {
  const stmt = db.prepare(`
    UPDATE guilds SET ticket_counter = ticket_counter + 1 WHERE id = ? AND bot_id = ?
    RETURNING ticket_counter
  `);
  const result = stmt.get(guildId, botId);
  return result?.ticket_counter || 1;
};

// ===================
// Panel Operations
// ===================

export const createPanel = db.prepare(`
  INSERT INTO panels (guild_id, name, embed_title, embed_description, embed_color, embed_image, embed_thumbnail, embed_footer, embed_author_name, embed_author_icon)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

export const getPanel = db.prepare(`SELECT * FROM panels WHERE id = ?`);
export const getPanelsByGuild = db.prepare(`SELECT * FROM panels WHERE guild_id = ?`);
export const deletePanel = db.prepare(`DELETE FROM panels WHERE id = ?`);

export const updatePanelMessage = db.prepare(`
  UPDATE panels SET channel_id = ?, message_id = ? WHERE id = ?
`);

// ===================
// Panel Options
// ===================

export const createPanelOption = db.prepare(`
  INSERT INTO panel_options (panel_id, label, emoji, style, category_name, ticket_prefix, support_role_ids, welcome_message)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

export const getPanelOptions = db.prepare(`
  SELECT * FROM panel_options WHERE panel_id = ?
`);

export const getPanelOption = db.prepare(`SELECT * FROM panel_options WHERE id = ?`);
export const deletePanelOption = db.prepare(`DELETE FROM panel_options WHERE id = ?`);

// ===================
// Questions
// ===================

export const createQuestion = db.prepare(`
  INSERT INTO panel_questions (option_id, question, placeholder, required, min_length, max_length, style, position)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

export const getQuestionsByOption = db.prepare(`
  SELECT * FROM panel_questions WHERE option_id = ? ORDER BY position ASC
`);

export const deleteQuestion = db.prepare(`DELETE FROM panel_questions WHERE id = ?`);

// ===================
// Ticket Operations
// ===================

export const createTicket = db.prepare(`
  INSERT INTO tickets (bot_id, guild_id, channel_id, user_id, panel_id, option_id, ticket_number)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

export const getTicket = db.prepare(`SELECT * FROM tickets WHERE id = ?`);
export const getTicketByChannel = db.prepare(`SELECT * FROM tickets WHERE channel_id = ?`);
export const getOpenTicketByUser = db.prepare(`
  SELECT * FROM tickets WHERE guild_id = ? AND user_id = ? AND option_id = ? AND status = 'open'
`);

export const getTicketsByGuild = db.prepare(`
  SELECT * FROM tickets WHERE guild_id = ? ORDER BY opened_at DESC LIMIT ? OFFSET ?
`);

export const getOpenTicketsCount = db.prepare(`
  SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND status = 'open'
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

// ===================
// Ticket Responses
// ===================

export const saveTicketResponse = db.prepare(`
  INSERT INTO ticket_responses (ticket_id, question, response) VALUES (?, ?, ?)
`);

export const getTicketResponses = db.prepare(`
  SELECT * FROM ticket_responses WHERE ticket_id = ?
`);

// ===================
// Ticket Participants
// ===================

export const addParticipant = db.prepare(`
  INSERT OR IGNORE INTO ticket_participants (ticket_id, user_id, added_by) VALUES (?, ?, ?)
`);

export const removeParticipant = db.prepare(`
  DELETE FROM ticket_participants WHERE ticket_id = ? AND user_id = ?
`);

export const getParticipants = db.prepare(`
  SELECT * FROM ticket_participants WHERE ticket_id = ?
`);

// ===================
// Steam Links (Phase 2)
// ===================

export const linkSteam = db.prepare(`
  INSERT OR REPLACE INTO steam_links (user_id, steam_id, steam_name) VALUES (?, ?, ?)
`);

export const unlinkSteam = db.prepare(`
  DELETE FROM steam_links WHERE user_id = ?
`);

export const getSteamLink = db.prepare(`
  SELECT * FROM steam_links WHERE user_id = ?
`);

// ===================
// Templates (Phase 2)
// ===================

export const createTemplate = db.prepare(`
  INSERT INTO templates (guild_id, name, panel_data) VALUES (?, ?, ?)
`);

export const getTemplate = db.prepare(`
  SELECT * FROM templates WHERE id = ?
`);

export const getTemplatesByGuild = db.prepare(`
  SELECT * FROM templates WHERE guild_id = ?
`);

export const deleteTemplate = db.prepare(`
  DELETE FROM templates WHERE id = ?
`);

// Custom Commands are defined at the end of file with bot_id support

// ===================
// Auto-Close (Phase 2)
// ===================

export const updateTicketActivity = db.prepare(`
  UPDATE tickets SET last_activity = CURRENT_TIMESTAMP WHERE channel_id = ?
`);

export const getInactiveTickets = db.prepare(`
  SELECT t.*, g.auto_close_hours, g.auto_close_warning_hours 
  FROM tickets t 
  JOIN guilds g ON t.guild_id = g.id 
  WHERE t.status = 'open' 
  AND g.auto_close_hours > 0
  AND datetime(t.last_activity, '+' || g.auto_close_hours || ' hours') < datetime('now')
`);

export const getTicketsToWarn = db.prepare(`
  SELECT t.*, g.auto_close_hours, g.auto_close_warning_hours 
  FROM tickets t 
  JOIN guilds g ON t.guild_id = g.id 
  WHERE t.status = 'open' 
  AND t.warned_auto_close = 0
  AND g.auto_close_hours > 0
  AND g.auto_close_warning_hours > 0
  AND datetime(t.last_activity, '+' || (g.auto_close_hours - g.auto_close_warning_hours) || ' hours') < datetime('now')
`);

export const markTicketWarned = db.prepare(`
  UPDATE tickets SET warned_auto_close = 1 WHERE id = ?
`);

// ===================
// Statistics (Phase 2)
// ===================

export const setFirstResponse = db.prepare(`
  UPDATE tickets 
  SET first_response_at = CURRENT_TIMESTAMP,
      response_time_seconds = (strftime('%s', 'now') - strftime('%s', opened_at))
  WHERE id = ? AND first_response_at IS NULL
`);

export const getTicketStats = db.prepare(`
  SELECT 
    COUNT(*) as total_tickets,
    SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_tickets,
    SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_tickets,
    AVG(response_time_seconds) as avg_response_time,
    COUNT(DISTINCT claimed_by) as staff_count
  FROM tickets 
  WHERE guild_id = ?
`);

export const getStaffStats = db.prepare(`
  SELECT 
    claimed_by as user_id,
    COUNT(*) as tickets_claimed,
    AVG(response_time_seconds) as avg_response_time
  FROM tickets 
  WHERE guild_id = ? AND claimed_by IS NOT NULL
  GROUP BY claimed_by
  ORDER BY tickets_claimed DESC
  LIMIT 10
`);

export const getTicketsByCategory = db.prepare(`
  SELECT 
    po.label as category,
    COUNT(*) as count
  FROM tickets t
  LEFT JOIN panel_options po ON t.option_id = po.id
  WHERE t.guild_id = ?
  GROUP BY po.label
  ORDER BY count DESC
`);

// ===================
// Custom Commands
// ===================

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

export const deleteCustomCommand = db.prepare(`
  DELETE FROM custom_commands WHERE guild_id = ? AND bot_id = ? AND trigger = ?
`);

export default db;

