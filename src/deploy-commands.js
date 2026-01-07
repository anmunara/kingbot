import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const commands = [];
const commandsPath = join(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

console.log('Loading commands...');

for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    const command = await import(`file://${filePath}`);

    if ('data' in command) {
        commands.push(command.data.toJSON());
        console.log(`✓ ${command.data.name}`);
    }
}

const rest = new REST().setToken(config.token);

(async () => {
    try {
        console.log(`\nStarting deployment of ${commands.length} commands...`);

        // Deploy to specific guild (faster for development)
        if (config.guildId) {
            await rest.put(
                Routes.applicationGuildCommands(config.clientId, config.guildId),
                { body: commands },
            );
            console.log(`✅ Commands deployed to guild: ${config.guildId}`);
        } else {
            // Deploy globally (takes up to 1 hour to update)
            await rest.put(
                Routes.applicationCommands(config.clientId),
                { body: commands },
            );
            console.log('✅ Commands deployed globally');
        }

    } catch (error) {
        console.error('Error deploying commands:', error);
    }
})();
