import { getWelcomeSettings } from '../../web/database.js';

export async function handleGuildMemberAdd(member, botId) {
    try {
        const guild = member.guild;
        const settings = getWelcomeSettings.get(guild.id, botId);

        if (!settings) return;

        // Auto Role
        if (settings.autorole_enabled && settings.autorole_id) {
            try {
                const role = guild.roles.cache.get(settings.autorole_id);
                if (role) {
                    await member.roles.add(role);
                    console.log(`[AutoRole] Added role ${role.name} to ${member.user.tag} in ${guild.name}`);
                }
            } catch (err) {
                console.error(`[AutoRole] Failed to add role in ${guild.name}:`, err.message);
            }
        }

        // Welcome Message
        if (settings.welcome_enabled && settings.welcome_channel_id) {
            const channel = guild.channels.cache.get(settings.welcome_channel_id);
            if (channel && channel.isTextBased()) {
                const { CanvasUtils } = await import('../../web/utils/canvasUtils.js'); // Dynamic import to avoid path issues

                let content = settings.welcome_message || 'Welcome {USER} to {SERVER}!';

                // Replace variables
                content = content
                    .replace(/{USER}/g, `<@${member.id}>`)
                    .replace(/{USER_TAG}/g, member.user.tag)
                    .replace(/{USER_NAME}/g, member.user.username)
                    .replace(/{SERVER}/g, guild.name)
                    .replace(/{MEMBER_COUNT}/g, guild.memberCount);

                const payload = { content, allowedMentions: { users: [member.id] } };

                // Generate Image if enabled
                if (settings.welcome_card_enabled) {
                    try {
                        const image = await CanvasUtils.generateWelcomeImage(member, {
                            backgroundUrl: settings.card_background ? `http://localhost:${process.env.WEB_PORT || 3000}${settings.card_background}` : null,
                            font: settings.card_font,
                            textColor: settings.card_text_color,
                            opacity: settings.card_overlay_opacity
                        });

                        const { AttachmentBuilder } = await import('discord.js');
                        const attachment = new AttachmentBuilder(image, { name: 'welcome.png' });
                        payload.files = [attachment];
                    } catch (imgErr) {
                        console.error('[Welcome] Failed to generate image:', imgErr);
                    }
                }

                await channel.send(payload);
            }
        }

    } catch (error) {
        console.error('Error in guildMemberAdd:', error);
    }
}
