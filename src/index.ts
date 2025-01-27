require("dotenv").config(); // .env config
import { getJSFiles, registerSlashCommands } from "./handler"; //for commands config
import { Player } from "discord-player"; // player for discord-player
import { vcCheck } from "./checks"; // checks for music based commands
import { join } from "path"; // idk what this is for
import { PhantomKnight } from "./construct"; // custom class to remove typescript errors
import "reflect-metadata"; // for class decorators
import {
    CommandInteraction,
    GuildMember,
    Message,
    Collection,
    MessageEmbed,
    ActivitiesOptions,
} from "discord.js"; // importing types
import { AutoPoster } from "topgg-autoposter"; // autoposter to post topgg stats
import { sendWelcomeMessage, autoMod, levelling, deleteEmojis } from "./events"; // events config
import { command } from "./types"; // command type
import { prisma } from "./prisma"; // prisma config
import { singleMessageDelete } from "./events";
import { promisify } from "util";
import { messageUpdateHandler } from "./events/messageUpdate";
import { hyperlink } from "@discordjs/builders";
const wait = promisify(setTimeout);
const MusicCommand: string[] = [
    "disconnect",
    "fast-forward",
    "pause",
    "play",
    "previous",
    "resume",
    "seek",
    "skip",
    "play-playlist",
];
const economyCommands = [
    "balance",
    "deposit",
    "give",
    "rob",
    "withdraw",
    "work",
];
const client = new PhantomKnight();
if (process.env.topggtoken) {
    const ap = AutoPoster(process.env.topggtoken as string, client);
    ap.on("posted", () => {
        console.log("posted Stats to Top.gg");
    });
}
client.commands = new Collection();
const commands = [];

const commandFiles = getJSFiles(join(__dirname, "commands"));

commandFiles.forEach((file) => {
    const command = require(file);

    commands.push(command.command.toJSON());
    client.commands.set(command.command.name, command);
});
const player = new Player(client, {
    ytdlOptions: {
        filter: "audioonly",
        dlChunkSize: 0,
        highWaterMark: 1 << 25,
    },
});

player.on("error", (_, error) => {
    console.log(error);
});
player.on("connectionError", (_, error) => {
    console.log(error);
});

registerSlashCommands(commands, false);
client.on("ready", async () => {
    console.log(`Logged in as ${client.user.tag}! at ${new Date()}`);
    const activities: ActivitiesOptions[] = [
        {
            name: "Screams of Developers",
            type: "LISTENING",
        },
        {
            name: "Made By 'PHANTOM KNIGHT#9254'",
            type: "LISTENING",
        },
        {
            name: "Living in the shadow of the sun",
            type: "PLAYING",
        },
        {
            name: "Living Alone in an EC2",
            type: "PLAYING",
        },
        {
            name: "Not as Easy as You Think",
            type: "PLAYING",
        },
        {
            name: `${client.users.cache.size} Members`,
            type: "WATCHING",
        },
        {
            name: `${client.guilds.cache.size} Servers`,
            type: "WATCHING",
        },
    ];
    setInterval(() => {
        client.user.setPresence({
            activities: [
                activities[Math.floor(Math.random() * activities.length)],
            ],
            status: "online",
            afk: true,
        });
    }, 10000);
});

client.on("interactionCreate", async (interaction: CommandInteraction) => {
    if (!interaction.guild)
        return void (await interaction.reply({
            content: "You can't use these commands in DM's!",
        }));
    if (economyCommands.includes(interaction.commandName)) {
        return void (await interaction.reply({
            content: "These Commands Are Deprecated!",
        }));
    }
    if (MusicCommand.includes(interaction.commandName)) {
        const { checkFailed, message } = vcCheck(interaction);
        if (checkFailed) {
            return await interaction.reply({
                content: message,
            });
        }
    }
    if (!interaction.isCommand()) {
        return;
    }
    const command = client.commands.get(interaction.commandName);
    if (!command) {
        return;
    }
    try {
        await (command as command).run(interaction, client);
    } catch (error) {
        console.log(error);
    }
});

client.on("guildMemberAdd", async (userJoined: GuildMember) => {
    await sendWelcomeMessage(userJoined, client);
});

client.on("guildCreate", async (guild) => {
    client.guilds.cache.get(guild.id)?.emojis.cache.forEach(async (emoji) => {
        await wait(2000);
        await prisma.emojis.create({
            data: {
                customName: emoji.name,
                guildId: guild.id,
                emoji: emoji.toString(),
            },
        });
    });
});

client.on("guildDelete", async (guild) => {
    await deleteEmojis(guild);
});

client.on("messageCreate", async (message: Message) => {
    if (message.content.includes(`<@!${client.user.id}>`)) {
        const embed = new MessageEmbed()
            .setColor("RANDOM")
            .setTimestamp()
            .setDescription(
                "The Bot uses `Slash Commands` instead of `Message Commands`!\n To Use a command type `/` and wait for a menu to appear."
            )
            .addField(
                "Commands Not Showing?",
                `This can happen because our Bot needs \`applications.commands\` scope. To Add The scope click ${hyperlink(
                    "here",
                    `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=-9&scope=bot%20applications.commands`
                )}`
            )
            .addField(
                "Commands Not Working?",
                `Create an Issue on ${hyperlink(
                    "Github",
                    "https://github.com/PhantomKnight287/PhantomKnight"
                )}`
            );
        await message.channel.send({ embeds: [embed] });
    }
    if (message.author.bot) return;
    await autoMod(message);
    await levelling(message);
});

client.on("emojiCreate", async (emoji) => {
    await prisma.emojis.create({
        data: {
            customName: emoji.name,
            emoji: emoji.toString(),
            guildId: emoji.guild.id,
        },
    });
});

client.on("emojiDelete", async (emoji) => {
    await prisma.emojis.delete({
        where: {
            guildId: emoji.guild.id,
            emoji: emoji.toString(),
        },
    });
});
client.on("emojiUpdate", async (oldEmoji, newEmoji) => {
    await prisma.emojis.update({
        where: {
            guildId: newEmoji.guild.id,
            emoji: oldEmoji.toString(),
        },
        data: {
            guildId: oldEmoji.guild.id,
            emoji: newEmoji.toString(),
        },
    });
});

client.on("messageDelete", async (message) => {
    if (!message.guildId) return;
    await singleMessageDelete(message);
});
client.on("messageUpdate", async (oldMessage, newMessage) => {
    if (!oldMessage.guildId) return;
    await messageUpdateHandler(oldMessage, newMessage);
});
const betcoin = "<:betcoin:896012051946803251>";
client.login(process.env.token as string);

export { player, client, betcoin };
