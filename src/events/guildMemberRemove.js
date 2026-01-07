import { getWelcomeSettings } from '../../web/database.js';

export async function handleGuildMemberRemove(member, botId) {
    try {
        const guild = member.guild;
        const settings = getWelcomeSettings.get(guild.id, botId);

        if (!settings) return;

        // Goodbye Message
        if (settings.goodbye_enabled && settings.goodbye_channel_id) {
            const channel = guild.channels.cache.get(settings.goodbye_channel_id);
            if (channel && channel.isTextBased()) {
                const { CanvasUtils } = await import('../../web/utils/canvasUtils.js');

                let content = settings.goodbye_message || '{USER} has left the server.';

                // Replace variables
                content = content
                    .replace(/{USER}/g, `**${member.user.username}**`) // Don't ping on leave
                    .replace(/{USER_TAG}/g, member.user.tag)
                    .replace(/{USER_NAME}/g, member.user.username)
                    .replace(/{SERVER}/g, guild.name)
                    .replace(/{MEMBER_COUNT}/g, guild.memberCount);

                const payload = { content };

                // Generate Image if enabled (Reuse welcome card settings for style)
                if (settings.welcome_card_enabled) {
                    try {
                        const image = await CanvasUtils.generateGoodbyeImage(member, {
                            backgroundUrl: settings.card_background ? `http://localhost:${process.env.WEB_PORT || 3000}${settings.card_background}` : null,
                            font: settings.card_font,
                            textColor: settings.card_text_color,
                            opacity: settings.card_overlay_opacity
                        });

                        const { AttachmentBuilder } = await import('discord.js');
                        const attachment = new AttachmentBuilder(image, { name: 'goodbye.png' });
                        payload.files = [attachment];
                    } catch (imgErr) {
                        console.error('[Goodbye] Failed to generate image:', imgErr);
                    }
                }

                await channel.send(payload);
            }
        }

    } catch (error) {
        console.error('Error in guildMemberRemove:', error);
    }
}
