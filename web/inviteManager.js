import { db } from './database.js';

class InviteManager {
    constructor() {
        this.invites = new Map(); // guildId -> Map(code -> uses)
        this.vanityUses = new Map(); // guildId -> uses
    }

    // Cache invites for a guild
    async cacheGuildInvites(guild) {
        if (!guild) return;
        try {
            const invites = await guild.invites.fetch().catch(() => new Map());
            const codeUses = new Map();

            invites.forEach(inv => {
                codeUses.set(inv.code, inv.uses);
            });

            this.invites.set(guild.id, codeUses);

            if (guild.features.includes('VANITY_URL')) {
                const vanity = await guild.fetchVanityData().catch(() => null);
                if (vanity) {
                    this.vanityUses.set(guild.id, vanity.uses);
                }
            }
        } catch (error) {
            console.error(`[InviteManager] Failed to cache invites for ${guild.id}:`, error);
        }
    }

    // Handle Member Join
    async handleMemberAdd(member) {
        const guild = member.guild;
        const cachedInvites = this.invites.get(guild.id) || new Map();
        const cachedVanityUses = this.vanityUses.get(guild.id) || 0;

        try {
            // Fetch new state
            const newInvites = await guild.invites.fetch().catch(() => new Map());
            let usedInvite = null;

            // Check standard invites
            for (const [code, inv] of newInvites) {
                const oldUses = cachedInvites.get(code) || 0;
                if (inv.uses > oldUses) {
                    usedInvite = inv;
                    break;
                }
            }

            // Check vanity if no standard found
            if (!usedInvite && guild.features.includes('VANITY_URL')) {
                const vanity = await guild.fetchVanityData().catch(() => null);
                if (vanity && vanity.uses > cachedVanityUses) {
                    usedInvite = { code: vanity.code, inviter: null, isVanity: true };
                }
            }

            // Log to DB
            if (usedInvite) {
                const inviterId = usedInvite.inviter ? usedInvite.inviter.id : null;
                db.prepare(`
                    INSERT INTO invite_joins (guild_id, user_id, inviter_id, code)
                    VALUES (?, ?, ?, ?)
                `).run(guild.id, member.id, inviterId, usedInvite.code);

                console.log(`[InviteTracker] ${member.user.tag} joined using ${usedInvite.code} (Invited by: ${inviterId || 'System/Vanity'})`);
            } else {
                console.log(`[InviteTracker] Could not determine invite for ${member.user.tag} (Unknown/Temporary)`);
                // Optional: Log as unknown
                db.prepare(`
                    INSERT INTO invite_joins (guild_id, user_id, inviter_id, code)
                    VALUES (?, ?, ?, ?)
                `).run(guild.id, member.id, 'unknown', 'unknown');
            }

            // Update Cache
            this.cacheGuildInvites(guild);

        } catch (error) {
            console.error('[InviteManager] Error handling member join:', error);
        }
    }

    // Handle Invite Create (Update Cache)
    handleInviteCreate(invite) {
        const guildInvites = this.invites.get(invite.guild.id);
        if (guildInvites) {
            guildInvites.set(invite.code, invite.uses);
        }
    }

    // Handle Invite Delete (Update Cache)
    handleInviteDelete(invite) {
        const guildInvites = this.invites.get(invite.guild.id);
        if (guildInvites) {
            guildInvites.delete(invite.code);
        }
    }
}

export const inviteManager = new InviteManager();
