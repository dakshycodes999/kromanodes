/**
 * KromaNodes Discord Invite Tracker Bot
 * 
 * This bot tracks user invites and syncs them to your Supabase database.
 * When a user joins using a member's invite link, the bot increments that member's 
 * invite count in the DB, which instantly unlocks rewards in the Client Panel.
 * 
 * Dependencies: discord.js, @supabase/supabase-js, dotenv
 */

require('dotenv').config();
const { Client, GatewayIntentBits, Collection, ActivityType, EmbedBuilder } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

// 1. Initialize Supabase Client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
let supabase = null;

if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('[Database] Supabase Client Initialized.');
} else {
    console.warn('[Database] WARNING: Supabase credentials missing. Bot running in mock database mode.');
}

// 2. Initialize Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Cache to store invites: key = Guild ID, value = Collection(Invite Code, Uses)
const invitesCache = new Collection();

// 3. Helper Function to Fetch Guild Invites
async function fetchGuildInvites(guild) {
    try {
        const invites = await guild.invites.fetch();
        const codeUses = new Collection();
        invites.forEach(inv => {
            codeUses.set(inv.code, inv.uses);
        });
        return codeUses;
    } catch (err) {
        console.error(`[Invites] Failed to fetch invites for guild ${guild.name}:`, err.message);
        return new Collection();
    }
}

// 4. Client Event: Ready
client.once('ready', async () => {
    console.log(`[Bot] Logged in as ${client.user.tag}`);
    
    // Set status
    client.user.setPresence({
        activities: [{ name: 'minecraft servers | /invites', type: ActivityType.Watching }],
        status: 'online'
    });

    // Cache invites for all guilds
    for (const [guildId, guild] of client.guilds.cache) {
        const invites = await fetchGuildInvites(guild);
        invitesCache.set(guildId, invites);
        console.log(`[Invites] Cached ${invites.size} invites for guild: ${guild.name}`);
    }
});

// 5. Client Events: Keep Cache Synced when Invites are Created or Deleted
client.on('inviteCreate', async (invite) => {
    const guildInvites = invitesCache.get(invite.guild.id) || new Collection();
    guildInvites.set(invite.code, invite.uses);
    invitesCache.set(invite.guild.id, guildInvites);
    console.log(`[Invites] New invite created: ${invite.code} by ${invite.inviter?.tag}`);

    // Register invite in database if possible
    if (supabase && invite.inviter) {
        // Upsert user first in case they aren't in DB yet
        await supabase.from('users').upsert({
            id: invite.inviter.id,
            username: invite.inviter.username,
            discriminator: invite.inviter.discriminator,
            avatar_url: invite.inviter.displayAvatarURL()
        });

        // Insert invite
        await supabase.from('invites').insert({
            code: invite.code,
            inviter_id: invite.inviter.id,
            uses: invite.uses
        });
    }
});

client.on('inviteDelete', (invite) => {
    const guildInvites = invitesCache.get(invite.guild.id);
    if (guildInvites) {
        guildInvites.delete(invite.code);
        console.log(`[Invites] Invite deleted: ${invite.code}`);
    }
});

// 6. Client Event: Guild Member Joins (Invite Tracking Logic)
client.on('guildMemberAdd', async (member) => {
    console.log(`[Join] Member joined: ${member.user.tag}`);

    const guild = member.guild;
    const oldInvites = invitesCache.get(guild.id);
    const newInvites = await fetchGuildInvites(guild);
    
    // Update cache
    invitesCache.set(guild.id, newInvites);

    let usedInvite = null;
    
    // Compare new invites uses with old ones
    if (oldInvites) {
        for (const [code, uses] of newInvites) {
            const oldUses = oldInvites.get(code);
            if (oldUses !== undefined && uses > oldUses) {
                usedInvite = code;
                break;
            }
        }
    }

    // Fallback: If invite has 1 use and wasn't in cache, it might be new
    if (!usedInvite && oldInvites) {
        for (const [code, uses] of newInvites) {
            if (!oldInvites.has(code) && uses > 0) {
                usedInvite = code;
                break;
            }
        }
    }

    if (usedInvite) {
        console.log(`[Tracker] Member ${member.user.username} joined using code ${usedInvite}`);
        
        // Fetch detailed invite info from discord API to find the inviter
        try {
            const inviteDetails = await guild.invites.fetch(usedInvite);
            const inviter = inviteDetails.inviter;

            if (inviter) {
                // Prevent self-invitation
                if (inviter.id === member.id) {
                    console.log(`[Tracker] Self invite detected. Ignoring.`);
                    return;
                }

                console.log(`[Tracker] Inviter identified: ${inviter.tag} (${inviter.id})`);
                
                if (supabase) {
                    // 1. Verify this joining user hasn't joined/been referred before (anti-fraud)
                    const { data: existingReferral } = await supabase
                        .from('referred_users')
                        .select('*')
                        .eq('referred_id', member.id)
                        .single();

                    if (existingReferral) {
                        console.log(`[Anti-Cheat] User ${member.user.tag} has already been referred before. Skipping reward.`);
                        return;
                    }

                    // 2. Insert referred user mapping
                    const { error: referralErr } = await supabase
                        .from('referred_users')
                        .insert({
                            referred_id: member.id,
                            inviter_id: inviter.id,
                            invite_code: usedInvite
                        });

                    if (referralErr) {
                        console.error('[Database] Failed to log referred user:', referralErr.message);
                        return;
                    }

                    // 3. Register or update the Inviter in users table
                    await supabase.from('users').upsert({
                        id: inviter.id,
                        username: inviter.username,
                        discriminator: inviter.discriminator,
                        avatar_url: inviter.displayAvatarURL()
                    });

                    // 4. Increment Inviter's invite count in DB
                    const { data: userData, error: updateErr } = await supabase.rpc('increment_invite_count', {
                        inviter_user_id: inviter.id
                    });

                    // Note: If rpc isn't set up yet, you can do a standard update instead:
                    if (updateErr) {
                        // Fallback manual increment query:
                        const { data: currentInviter } = await supabase.from('users').select('invite_count').eq('id', inviter.id).single();
                        const currentCount = currentInviter ? currentInviter.invite_count : 0;
                        await supabase.from('users').update({ invite_count: currentCount + 1 }).eq('id', inviter.id);
                        console.log(`[Database] Manual incremented ${inviter.tag} invites to ${currentCount + 1}`);
                    } else {
                        console.log(`[Database] RPC Incremented ${inviter.tag} invites.`);
                    }

                    // Send congratulatory message to inviter on Discord
                    try {
                        const embed = new EmbedBuilder()
                            .setColor('#00f0ff')
                            .setTitle('🎉 New Invite Logged!')
                            .setDescription(`Hey! **${member.user.username}** joined using your invite link.\nYour active invites count has increased!`)
                            .addFields(
                                { name: 'Invited Member', value: member.user.username, inline: true },
                                { name: 'Invite Code', value: usedInvite, inline: true }
                            )
                            .setFooter({ text: 'Claim your rewards at dashboard.kromanodes.com' })
                            .setTimestamp();

                        await inviter.send({ embeds: [embed] });
                    } catch (dmErr) {
                        console.log(`[DM] Could not DM inviter ${inviter.tag} (DMs locked).`);
                    }
                }
            }
        } catch (fetchErr) {
            console.error('[Tracker] Failed to fetch invite details:', fetchErr.message);
        }
    } else {
        console.log(`[Tracker] Could not determine which invite was used for ${member.user.tag}. (Could be vanilla vanity URL or custom widget)`);
    }
});

// 7. Command Handling (Prefix commands as fallback or Slash Commands)
// Standard Discord.js Command Handler for simple debugging
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'invites' || command === 'stats') {
        const targetUser = message.mentions.users.first() || message.author;
        
        let invitesCount = 0;
        let ramCap = '2.0 GB';

        if (supabase) {
            const { data } = await supabase
                .from('users')
                .select('invite_count, ram_limit_mb')
                .eq('id', targetUser.id)
                .single();
            
            if (data) {
                invitesCount = data.invite_count;
                ramCap = (data.ram_limit_mb / 1024).toFixed(2) + ' GB';
            }
        } else {
            // Mock value if db is offline
            invitesCount = Math.floor(Math.random() * 5);
        }

        const embed = new EmbedBuilder()
            .setColor('#bd00ff')
            .setTitle(`📊 KromaNodes Stats for ${targetUser.username}`)
            .addFields(
                { name: 'Total Invites', value: `${invitesCount} invites`, inline: true },
                { name: 'RAM Limit', value: ramCap, inline: true },
                { name: 'Active Slots', value: '1 server slot', inline: true }
            )
            .setThumbnail(targetUser.displayAvatarURL())
            .setFooter({ text: 'dashboard.kromanodes.com' })
            .setTimestamp();

        message.reply({ embeds: [embed] });
    }
});

// 8. Log In Client
const token = process.env.DISCORD_BOT_TOKEN;
if (token) {
    client.login(token);
} else {
    console.error('[Bot] ERROR: DISCORD_BOT_TOKEN is missing in environment variables. Please check your .env file.');
}
