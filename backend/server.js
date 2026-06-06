/**
 * KromaNodes - Production Express.js Backend API (Custom Credentials Version)
 * 
 * Manages:
 * 1. Custom Email/Password Authentication (JWT + Bcrypt)
 * 2. Supabase SQL Database Sync
 * 3. Pterodactyl Application API (Creating/managing users and servers)
 * 4. Pterodactyl Client API Proxy (Server power actions, console logs)
 */

require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURATION ---
const JWT_SECRET = process.env.JWT_SECRET || 'kromanodes-super-secret-jwt-key';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8080';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

const PTERO_URL = process.env.PTERODACTYL_URL; 
const PTERO_APP_KEY = process.env.PTERODACTYL_APPLICATION_KEY; 
const PTERO_CLIENT_KEY = process.env.PTERODACTYL_CLIENT_KEY; 

// --- INITIALIZE DATABASE ---
const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_ANON_KEY || ''
);

// --- MIDDLEWARES ---
app.use(cors({
    origin: [FRONTEND_URL, 'http://127.0.0.1:8080', 'http://localhost:8080'],
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../landing-website')));
app.use('/panel', express.static(path.join(__dirname, '../panel-website')));

// --- PTERODACTYL HTTP CLIENTS ---
const pteroAppApi = axios.create({
    baseURL: `${PTERO_URL}/api/application`,
    headers: {
        'Authorization': `Bearer ${PTERO_APP_KEY}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }
});

const pteroClientApi = axios.create({
    baseURL: `${PTERO_URL}/api/client`,
    headers: {
        'Authorization': `Bearer ${PTERO_CLIENT_KEY}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
    }
});

// --- AUTHENTICATION MIDDLEWARE ---
function authenticateToken(req, res, next) {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'Unauthorized. Please log in.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Session expired. Please log in again.' });
        req.user = user;
        next();
    });
}

// --- ROUTES ---

// 1. Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'online', brand: 'KromaNodes Custom Auth API' });
});

// 2. Custom Sign Up (Register)
app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Username, email, and password are required.' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    try {
        // Hash password securely
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Insert user into Supabase
        const { data: newUser, error: dbErr } = await supabase.from('users').insert({
            username,
            email,
            password_hash: passwordHash,
            ram_limit_mb: 2048,      // 2GB starting allocation
            max_server_slots: 1,     // 1 starting server slot
            claimedMilestones: []
        }).select().single();

        if (dbErr) {
            if (dbErr.code === '23505') {
                return res.status(400).json({ error: 'An account with this email already exists.' });
            }
            throw dbErr;
        }

        // Issue JWT token immediately
        const token = jwt.sign({
            id: newUser.id,
            username: newUser.username,
            email: newUser.email
        }, JWT_SECRET, { expiresIn: '7d' });

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.json({ success: true, user: { id: newUser.id, username: newUser.username, email: newUser.email } });

    } catch (err) {
        console.error('[Registration Error]', err.message);
        res.status(500).json({ error: 'Account registration failed.' });
    }
});

// 3. Custom Login (Sign In)
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
        // Find user by email in Supabase
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (error || !user) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // Compare password hashes
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // Issue JWT session token
        const token = jwt.sign({
            id: user.id,
            username: user.username,
            email: user.email
        }, JWT_SECRET, { expiresIn: '7d' });

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.json({ success: true, user: { id: user.id, username: user.username, email: user.email } });

    } catch (err) {
        console.error('[Login Error]', err.message);
        res.status(500).json({ error: 'Authentication failed.' });
    }
});

// 4. Get User Profile Session
app.get('/api/user/me', authenticateToken, async (req, res) => {
    try {
        const { data: userData, error } = await supabase
            .from('users')
            .select('id, username, email, coins, invite_count, ram_limit_mb, max_server_slots, claimedMilestones')
            .eq('id', req.user.id)
            .single();

        if (error) throw error;
        res.json(userData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. Sign Out
app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
});

// 6. List Servers (Owned by logged-in user)
app.get('/api/servers', authenticateToken, async (req, res) => {
    try {
        const { data: servers, error } = await supabase
            .from('servers')
            .select('*')
            .eq('owner_id', req.user.id);

        if (error) throw error;
        res.json(servers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. Deploy server on Pterodactyl
app.post('/api/servers', authenticateToken, async (req, res) => {
    const { name, egg_type, ram, disk } = req.body;
    
    if (!name || !ram || !disk) {
        return res.status(400).json({ error: 'Name, RAM, and Disk specifications are required.' });
    }

    try {
        const { data: user, error: userErr } = await supabase
            .from('users')
            .select('ram_limit_mb, max_server_slots, email')
            .eq('id', req.user.id)
            .single();

        if (userErr) throw userErr;

        const { data: activeServers, error: activeErr } = await supabase
            .from('servers')
            .select('ram_mb')
            .eq('owner_id', req.user.id);

        if (activeErr) throw activeErr;

        const allocatedRam = activeServers.reduce((sum, srv) => sum + srv.ram_mb, 0);

        if (activeServers.length >= user.max_server_slots) {
            return res.status(403).json({ error: `Server slots limit reached (${user.max_server_slots}).` });
        }
        if (allocatedRam + parseInt(ram) > user.ram_limit_mb) {
            return res.status(403).json({ error: `Not enough RAM. Remaining: ${user.ram_limit_mb - allocatedRam} MB.` });
        }

        // --- PTERODACTYL INTEGRATION FLOW ---
        // A. Resolve or create user on Pterodactyl by real email
        let pteroUserId = null;
        try {
            const searchResponse = await pteroAppApi.get(`/users?filter[email]=${user.email}`);
            if (searchResponse.data.data.length > 0) {
                pteroUserId = searchResponse.data.data[0].attributes.id;
            } else {
                // Create user
                const createResponse = await pteroAppApi.post('/users', {
                    email: user.email,
                    username: `user_${user.email.split('@')[0]}_${Math.floor(Math.random() * 1000)}`,
                    first_name: user.username,
                    last_name: 'Client'
                });
                pteroUserId = createResponse.data.attributes.id;
            }
        } catch (uErr) {
            console.error('[Ptero User Error]', uErr.response?.data || uErr.message);
            throw new Error('Could not synchronize profile with game panel.');
        }

        const eggIdMapping = {
            paper: 4,
            forge: 5,
            fabric: 6
        };
        const selectedEgg = eggIdMapping[egg_type] || 4; 

        const pteroServerResponse = await pteroAppApi.post('/servers', {
            name: name,
            user: pteroUserId,
            egg: selectedEgg,
            docker_image: 'ghcr.io/pterodactyl/yolks:java_17',
            startup: 'java -Xms128M -XX:MaxRAMPercentage=95.0 -jar {{SERVER_JARFILE}}',
            limits: {
                memory: parseInt(ram),
                swap: 0,
                disk: parseInt(disk) * 1024,
                io: 500,
                cpu: 100
            },
            feature_limits: {
                databases: 1,
                backups: 1
            },
            deploy: {
                locations: [1],
                dedicated_ip: false,
                port_range: []
            }
        });

        const newPteroSrv = pteroServerResponse.data.attributes;

        // C. Record in Supabase
        const { data: dbSrv, error: srvErr } = await supabase.from('servers').insert({
            pterodactyl_id: newPteroSrv.id,
            owner_id: req.user.id,
            name: name,
            egg_type: egg_type,
            ram_mb: parseInt(ram),
            disk_mb: parseInt(disk) * 1024,
            status: 'creating'
        }).select().single();

        if (srvErr) throw srvErr;

        res.json(dbSrv);

    } catch (err) {
        console.error('[Deployment Error]', err.response?.data || err.message);
        res.status(500).json({ error: err.message || 'Server deployment failed on game node.' });
    }
});

// 8. Proxy Power actions (start, stop, restart) to Pterodactyl client API
app.post('/api/servers/:id/power', authenticateToken, async (req, res) => {
    const { action } = req.body; 
    const serverId = req.params.id;

    if (!['start', 'stop', 'restart'].includes(action)) {
        return res.status(400).json({ error: 'Invalid power signal. Use start, stop, or restart.' });
    }

    try {
        const { data: srv } = await supabase.from('servers').select('pterodactyl_id').eq('id', serverId).single();
        if (!srv) return res.status(404).json({ error: 'Server not found.' });

        const pteroSrv = await pteroAppApi.get(`/servers/${srv.pterodactyl_id}`);
        const clientUuid = pteroSrv.data.attributes.uuid;

        await pteroClientApi.post(`/servers/${clientUuid}/power`, { signal: action });

        const statusMapping = { start: 'running', stop: 'offline', restart: 'running' };
        await supabase.from('servers').update({ status: statusMapping[action] }).eq('id', serverId);

        res.json({ success: true, status: statusMapping[action] });

    } catch (err) {
        console.error('[Power Signal Error]', err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to send action command to server node.' });
    }
});

// 9. Fetch WebSocket terminal details (real live console logs)
app.get('/api/servers/:id/websocket', authenticateToken, async (req, res) => {
    const serverId = req.params.id;

    try {
        const { data: srv } = await supabase.from('servers').select('pterodactyl_id').eq('id', serverId).single();
        if (!srv) return res.status(404).json({ error: 'Server not found.' });

        const pteroSrv = await pteroAppApi.get(`/servers/${srv.pterodactyl_id}`);
        const clientUuid = pteroSrv.data.attributes.uuid;

        const wsResponse = await pteroClientApi.get(`/servers/${clientUuid}/websocket`);
        res.json(wsResponse.data);

    } catch (err) {
        console.error('[WebSocket Config Error]', err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to establish terminal communication.' });
    }
});

// 10. Claim Rewards
app.post('/api/rewards/claim', authenticateToken, async (req, res) => {
    const { milestone } = req.body;

    try {
        const { data: user } = await supabase.from('users').select('*').eq('id', req.user.id).single();
        if (!user) return res.status(404).json({ error: 'User profile not found.' });

        if (user.invite_count < milestone) {
            return res.status(403).json({ error: `Inadequate invites count. You have ${user.invite_count}, required: ${milestone}.` });
        }

        if (user.claimedMilestones && user.claimedMilestones.includes(milestone)) {
            return res.status(400).json({ error: 'Milestone rewards already claimed.' });
        }

        const milestones = {
            3: { ram: 512, slots: 0 },
            5: { ram: 0, slots: 1 },
            10: { ram: 1024, slots: 0 },
            15: { ram: 2048, slots: 0 }
        };

        const reward = milestones[milestone];
        if (!reward) return res.status(400).json({ error: 'Invalid milestone request.' });

        const updatedClaimed = [...(user.claimedMilestones || []), milestone];
        const newRamLimit = user.ram_limit_mb + reward.ram;
        const newSlotsLimit = user.max_server_slots + reward.slots;

        await supabase.from('users').update({
            claimedMilestones: updatedClaimed,
            ram_limit_mb: newRamLimit,
            max_server_slots: newSlotsLimit
        }).eq('id', req.user.id);

        res.json({ success: true, ram_limit_mb: newRamLimit, max_server_slots: newSlotsLimit });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- START SERVER ---
app.listen(PORT, () => {
    console.log(`[Server] KromaNodes Custom Auth Backend listening on port ${PORT}`);
    console.log(`[Server] Frontend URL mapped: ${FRONTEND_URL}`);
});
