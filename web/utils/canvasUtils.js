import { GlobalFonts, createCanvas, loadImage } from '@napi-rs/canvas';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load fonts if needed (optional)
// GlobalFonts.registerFromPath(join(__dirname, '..', 'fonts', 'Inter-Bold.ttf'), 'Inter');

export class CanvasUtils {
    static async generateWelcomeImage(member, options = {}) {
        return this.createImage(member, 'WELCOME', options);
    }

    static async generateGoodbyeImage(member, options = {}) {
        return this.createImage(member, 'GOODBYE', options);
    }

    static async createImage(member, type, options = {}) {
        const width = 800;
        const height = 300;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // Background
        if (options.backgroundUrl) {
            try {
                const bg = await loadImage(options.backgroundUrl);
                ctx.drawImage(bg, 0, 0, width, height);
            } catch (e) {
                this.drawDefaultBackground(ctx, width, height);
            }
        } else {
            this.drawDefaultBackground(ctx, width, height);
        }

        // Overlay (Darken background)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(0, 0, width, height);

        // Avatar
        const avatarSize = 150;
        const avatarX = width / 2;
        const avatarY = height / 2 - 20;

        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.clip();

        try {
            const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256 });
            const avatar = await loadImage(avatarUrl);
            ctx.drawImage(avatar, avatarX - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize);
        } catch (e) {
            // Draw placeholder if avatar fails
            ctx.fillStyle = '#7289da';
            ctx.fillRect(avatarX - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize);
        }
        ctx.restore();

        // Border around avatar
        ctx.beginPath();
        ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2, true);
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        // Text: Title (WELCOME / GOODBYE)
        ctx.font = 'bold 50px Arial'; // Fallback to Arial if Inter not loaded
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(type, width / 2, height / 2 + 80);

        // Text: Username
        ctx.font = '30px Arial';
        ctx.fillStyle = '#cccccc';
        ctx.fillText(member.user.tag, width / 2, height / 2 + 120);

        return canvas.toBuffer('image/png');
    }

    static drawDefaultBackground(ctx, width, height) {
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#2b2d31');
        gradient.addColorStop(1, '#111214');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    }
}
