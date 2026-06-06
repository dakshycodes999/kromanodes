// KromaNodes Control Panel - Production Dashboard Logic & Pterodactyl Integration

document.addEventListener('DOMContentLoaded', async () => {
    // --- API CONNECTION CONFIG ---
    const getBackendUrl = () => {
        const port = window.location.port;
        // If loaded from separate static dev servers, route to the backend port
        if (port === '8080' || port === '8000') {
            const host = window.location.hostname;
            if (host.includes('github.dev')) {
                return window.location.origin.replace('-8080', '-3000').replace('-8000', '-3000');
            }
            return 'http://localhost:3000';
        }
        // If running in unified production (Hugging Face / Render), use same origin
        return window.location.origin;
    };

    const API_URL = getBackendUrl();
    let isSimulationMode = true; // Falls back to simulation if backend is offline

    // Check backend connection
    async function checkBackendConnection() {
        try {
            const res = await fetch(`${API_URL}/api/health`);
            const data = await res.json();
            if (data.status === 'online') {
                isSimulationMode = false;
                console.log("[KromaNodes] Connected to production backend. Running in real mode.");
            }
        } catch (err) {
            console.warn("[KromaNodes] Backend server offline. Running in LocalStorage simulation mode.");
        }
    }

    await checkBackendConnection();

    // --- STATE MANAGEMENT ---
    const defaultState = {
        isLoggedIn: false,
        user: {
            username: 'Steve#4829',
            avatar: 'https://cdn.discordapp.com/embed/avatars/0.png',
            invites: 0,
            ramLimit: 2048, // 2GB
            maxSlots: 1,
            claimedMilestones: []
        },
        servers: []
    };

    let state = JSON.parse(localStorage.getItem('kromanodes_state')) || defaultState;

    function saveState() {
        if (isSimulationMode) {
            localStorage.setItem('kromanodes_state', JSON.stringify(state));
        }
    }

    // --- DOM ELEMENTS ---
    const loginScreen = document.getElementById('login-screen');
    const panelLayout = document.getElementById('panel-layout');
    const btnLogout = document.getElementById('btn-logout');

    // Custom Auth Form Fields
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const linkToRegister = document.getElementById('link-to-register');
    const linkToLogin = document.getElementById('link-to-login');

    const loginEmailInput = document.getElementById('login-email');
    const loginPasswordInput = document.getElementById('login-password');
    const registerUsernameInput = document.getElementById('register-username');
    const registerEmailInput = document.getElementById('register-email');
    const registerPasswordInput = document.getElementById('register-password');

    const userAvatar = document.getElementById('user-avatar');
    const userUsername = document.getElementById('user-username');
    
    // Header resources
    const allocatedRamDisplay = document.getElementById('allocated-ram-display');
    const maxRamDisplay = document.getElementById('max-ram-display');
    const allocatedSlotsDisplay = document.getElementById('allocated-slots-display');
    const maxSlotsDisplay = document.getElementById('max-slots-display');

    // Sidebar navigation
    const tabs = {
        overview: document.getElementById('tab-overview'),
        create: document.getElementById('tab-create'),
        rewards: document.getElementById('tab-rewards'),
        console: document.getElementById('tab-console')
    };
    const tabLinks = {
        overview: document.getElementById('tab-link-overview'),
        create: document.getElementById('tab-link-create'),
        rewards: document.getElementById('tab-link-rewards'),
        console: document.getElementById('tab-link-console')
    };
    const navInviteBadge = document.getElementById('nav-invite-badge');

    // Overview Tab
    const statRamText = document.getElementById('stat-ram-text');
    const statDiskText = document.getElementById('stat-disk-text');
    const statInvitesText = document.getElementById('stat-invites-text');
    const ramProgress = document.getElementById('ram-progress');
    const diskProgress = document.getElementById('disk-progress');
    const invitesProgress = document.getElementById('invites-progress');
    const emptyServers = document.getElementById('empty-servers');
    const serversGrid = document.getElementById('servers-grid');
    const btnQuickCreate = document.getElementById('btn-quick-create');
    const btnCreateFirstServer = document.getElementById('btn-create-first-server');

    // Create Server Tab
    const createServerForm = document.getElementById('create-server-form');
    const srvNameInput = document.getElementById('srv-name');
    const srvEggSelect = document.getElementById('srv-egg');
    const srvVersionSelect = document.getElementById('srv-version');
    const srvRamSlider = document.getElementById('srv-ram');
    const srvRamVal = document.getElementById('srv-ram-val');
    const srvDiskSlider = document.getElementById('srv-disk');
    const srvDiskVal = document.getElementById('srv-disk-val');
    const btnCancelCreate = document.getElementById('btn-cancel-create');

    // Rewards Tab
    const rewardsInviteCount = document.getElementById('rewards-invite-count');
    const rewardsRamCap = document.getElementById('rewards-ram-cap');
    const btnCopyReferral = document.getElementById('btn-copy-referral');
    const referralLink = document.getElementById('referral-link');
    const btnSimInvite = document.getElementById('btn-sim-invite');
    const btnSimReset = document.getElementById('btn-sim-reset');
    const rewardsGrid = document.getElementById('rewards-grid');

    // Console Tab
    const consoleServerName = document.getElementById('console-server-name');
    const consoleStatusIndicator = document.getElementById('console-status-indicator');
    const consoleTerminal = document.getElementById('console-terminal');
    const consoleCmdInput = document.getElementById('console-cmd-input');
    const btnSendCmd = document.getElementById('btn-send-cmd');
    const btnConsoleStart = document.getElementById('btn-console-start');
    const btnConsoleRestart = document.getElementById('btn-console-restart');
    const btnConsoleStop = document.getElementById('btn-console-stop');
    const ramCircleFill = document.getElementById('ram-circle-fill');
    const cpuCircleFill = document.getElementById('cpu-circle-fill');
    const consoleRamPercent = document.getElementById('console-ram-percent');
    const consoleCpuPercent = document.getElementById('console-cpu-percent');
    const consoleRamText = document.getElementById('console-ram-text');

    let activeConsoleServerId = null;
    let consoleInterval = null;

    // --- REWARDS CONFIGURATION ---
    const rewardsConfig = [
        { required: 3, rewardType: 'ram', value: 512, desc: 'Unlock +512MB RAM permanently!' },
        { required: 5, rewardType: 'slots', value: 1, desc: 'Unlock +1 extra server slot!' },
        { required: 10, rewardType: 'ram', value: 1024, desc: 'Unlock +1GB RAM permanently!' },
        { required: 15, rewardType: 'ram', value: 2048, desc: 'Unlock +2GB RAM permanently!' }
    ];

    // --- INIT APP ---
    async function init() {
        if (!isSimulationMode) {
            // Verify session credentials with backend API
            try {
                const res = await fetch(`${API_URL}/api/user/me`, { credentials: 'include' });
                if (res.ok) {
                    const userData = await res.json();
                    state.isLoggedIn = true;
                    state.user = {
                        username: userData.username,
                        avatar: userData.avatar_url,
                        invites: userData.invite_count || 0,
                        ramLimit: userData.ram_limit_mb || 2048,
                        maxSlots: userData.max_server_slots || 1,
                        claimedMilestones: userData.claimed_milestones || []
                    };
                    
                    // Fetch real user servers
                    const srvRes = await fetch(`${API_URL}/api/servers`, { credentials: 'include' });
                    if (srvRes.ok) {
                        state.servers = await srvRes.json();
                    }
                    showPanel();
                } else {
                    showLogin();
                }
            } catch (err) {
                console.error("[API Error] Auth handshake failed. Falling back to simulation.", err);
                isSimulationMode = true;
                initSimulationView();
            }
        } else {
            initSimulationView();
        }
    }

    function initSimulationView() {
        if (state.isLoggedIn) {
            showPanel();
        } else {
            showLogin();
        }
    }

    // --- LOGIN / LOGOUT ---
    function showLogin() {
        loginScreen.classList.remove('hidden');
        panelLayout.classList.add('hidden');
    }

    function showPanel() {
        loginScreen.classList.add('hidden');
        panelLayout.classList.remove('hidden');

        userAvatar.src = state.user.avatar;
        userUsername.textContent = state.user.username;
        referralLink.value = `https://discord.gg/kromanodes?ref=${state.user.username.split('#')[0]}`;

        updateGlobalResources();
        renderOverviewTab();
        renderRewardsTab();
        switchTab('overview');
    }

    // Custom Registration and Login switches
    linkToRegister.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
    });

    linkToLogin.addEventListener('click', (e) => {
        e.preventDefault();
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
    });

    // Custom Login Form Submit
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = loginEmailInput.value.trim();
        const password = loginPasswordInput.value;

        if (!isSimulationMode) {
            try {
                const res = await fetch(`${API_URL}/api/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password }),
                    credentials: 'include'
                });

                if (res.ok) {
                    state.isLoggedIn = true;
                    await init(); // Fetch real user session
                } else {
                    const err = await res.json();
                    alert(`Login failed: ${err.error}`);
                }
            } catch (err) {
                alert("Unable to contact backend authentication server.");
            }
        } else {
            // Mock Login
            state.isLoggedIn = true;
            state.user.username = email.split('@')[0];
            state.user.avatar = `https://cdn.discordapp.com/embed/avatars/${Math.floor(Math.random() * 5)}.png`;
            saveState();
            showPanel();
        }
    });

    // Custom Register Form Submit
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = registerUsernameInput.value.trim();
        const email = registerEmailInput.value.trim();
        const password = registerPasswordInput.value;

        if (!isSimulationMode) {
            try {
                const res = await fetch(`${API_URL}/api/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, email, password }),
                    credentials: 'include'
                });

                if (res.ok) {
                    alert("Account registered successfully!");
                    state.isLoggedIn = true;
                    await init(); // Log user in immediately
                } else {
                    const err = await res.json();
                    alert(`Registration failed: ${err.error}`);
                }
            } catch (err) {
                alert("Unable to contact backend authentication server.");
            }
        } else {
            // Mock Register
            alert("Mock account registered successfully!");
            state.isLoggedIn = true;
            state.user.username = username;
            state.user.avatar = `https://cdn.discordapp.com/embed/avatars/${Math.floor(Math.random() * 5)}.png`;
            saveState();
            showPanel();
        }
    });

    btnLogout.addEventListener('click', async () => {
        if (!isSimulationMode) {
            try {
                await fetch(`${API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
            } catch (err) {
                console.error(err);
            }
            window.location.reload();
        } else {
            state.isLoggedIn = false;
            saveState();
            showLogin();
        }
    });

    // --- TAB NAV ROUTER ---
    function switchTab(tabId) {
        Object.keys(tabs).forEach(key => {
            tabs[key].classList.remove('active');
            tabLinks[key].classList.remove('active');
        });

        tabs[tabId].classList.add('active');
        tabLinks[tabId].classList.add('active');

        const pageTitles = {
            overview: ['My Servers', 'Manage and monitor your deployed nodes.'],
            create: ['Create Server', 'Set up your premium node. Resources will be checked.'],
            rewards: ['Invite Rewards', 'Unlock premium server resource milestones.'],
            console: ['Server Console', 'View server terminal logs and execute commands.']
        };

        document.getElementById('page-title').textContent = pageTitles[tabId][0];
        document.getElementById('page-subtitle').textContent = pageTitles[tabId][1];

        if (tabId === 'overview') {
            refreshServersData().then(() => renderOverviewTab());
        } else if (tabId === 'rewards') {
            renderRewardsTab();
        } else if (tabId === 'create') {
            const allocated = calculateAllocatedResources();
            const ramLeft = state.user.ramLimit - allocated.ram;
            
            srvRamSlider.max = Math.max(1024, ramLeft);
            srvRamSlider.min = 1024;
            if (ramLeft < 1024) {
                srvRamSlider.value = 0;
                srvRamSlider.disabled = true;
                srvRamVal.textContent = "No RAM Available";
            } else {
                srvRamSlider.disabled = false;
                srvRamSlider.value = Math.min(2048, ramLeft);
                srvRamVal.textContent = srvRamSlider.value + " MB";
            }
        }
    }

    async function refreshServersData() {
        if (!isSimulationMode) {
            try {
                const srvRes = await fetch(`${API_URL}/api/servers`, { credentials: 'include' });
                if (srvRes.ok) {
                    state.servers = await srvRes.json();
                }
            } catch (err) {
                console.error("Failed to sync server array.", err);
            }
        }
    }

    Object.keys(tabLinks).forEach(key => {
        tabLinks[key].addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(key);
        });
    });

    // --- RESOURCES COMPUTING ---
    function calculateAllocatedResources() {
        let ram = 0;
        let disk = 0;
        state.servers.forEach(srv => {
            ram += parseInt(srv.ram_mb || srv.ram);
            disk += parseInt((srv.disk_mb / 1024) || srv.disk);
        });
        return { ram, disk };
    }

    function updateGlobalResources() {
        const allocated = calculateAllocatedResources();
        
        allocatedRamDisplay.textContent = allocated.ram + "MB";
        maxRamDisplay.textContent = state.user.ramLimit + "MB";
        
        allocatedSlotsDisplay.textContent = state.servers.length;
        maxSlotsDisplay.textContent = state.user.maxSlots;

        let claimableCount = 0;
        rewardsConfig.forEach(m => {
            if (state.user.invites >= m.required && !state.user.claimedMilestones.includes(m.required)) {
                claimableCount++;
            }
        });
        
        if (claimableCount > 0) {
            navInviteBadge.textContent = claimableCount;
            navInviteBadge.classList.remove('hidden');
        } else {
            navInviteBadge.classList.add('hidden');
        }
    }

    // --- OVERVIEW TAB RENDERING ---
    function renderOverviewTab() {
        const allocated = calculateAllocatedResources();
        
        statRamText.textContent = `${allocated.ram} MB / ${state.user.ramLimit} MB`;
        statDiskText.textContent = `${allocated.disk} GB / 5.0 GB`;
        statInvitesText.textContent = `${state.user.invites} Invites`;

        ramProgress.style.width = Math.min(100, (allocated.ram / state.user.ramLimit) * 100) + '%';
        diskProgress.style.width = Math.min(100, (allocated.disk / 5) * 100) + '%';
        invitesProgress.style.width = Math.min(100, (state.user.invites / 15) * 100) + '%';

        if (state.servers.length === 0) {
            emptyServers.classList.remove('hidden');
            serversGrid.classList.add('hidden');
        } else {
            emptyServers.classList.add('hidden');
            serversGrid.classList.remove('hidden');
            
            serversGrid.innerHTML = '';
            state.servers.forEach(srv => {
                const card = document.createElement('div');
                card.className = `server-node-card glass`;
                
                const srvRam = srv.ram_mb || srv.ram;
                const srvDisk = (srv.disk_mb / 1024) || srv.disk;
                const srvStatus = srv.status || 'offline';
                
                const indicatorClass = srvStatus === 'running' ? 'online' : (srvStatus === 'offline' ? 'offline' : 'starting');
                
                card.innerHTML = `
                    <div class="server-card-header">
                        <div class="srv-info-block">
                            <span class="srv-title">${srv.name}</span>
                            <span class="srv-software">${(srv.egg_type || srv.egg).toUpperCase()}</span>
                        </div>
                        <span class="server-status-pill ${indicatorClass}">${srvStatus}</span>
                    </div>
                    
                    <div class="server-card-resources">
                        <div class="srv-res-item">
                            <span class="srv-res-lbl">RAM</span>
                            <span class="srv-res-val">${srvRam} MB</span>
                        </div>
                        <div class="srv-res-item">
                            <span class="srv-res-lbl">CPU</span>
                            <span class="srv-res-val">${srv.cpu || 100}%</span>
                        </div>
                        <div class="srv-res-item">
                            <span class="srv-res-lbl">Disk</span>
                            <span class="srv-res-val">${srvDisk} GB</span>
                        </div>
                    </div>
                    
                    <div class="server-card-footer">
                        <span class="text-secondary" style="font-size: 0.8rem;"><i class="fa-solid fa-network-wired"></i> port:${srv.port || 25565}</span>
                        <div class="card-actions">
                            <button class="btn btn-secondary btn-sm btn-manage" data-id="${srv.id}">
                                <i class="fa-solid fa-terminal"></i> Console
                            </button>
                            <button class="btn btn-logout btn-sm btn-delete" data-id="${srv.id}" style="padding: 6px 10px;">
                                <i class="fa-regular fa-trash-can"></i>
                            </button>
                        </div>
                    </div>
                `;
                
                serversGrid.appendChild(card);
            });

            document.querySelectorAll('.btn-manage').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    openConsoleForServer(id);
                });
            });

            document.querySelectorAll('.btn-delete').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    if (confirm("Are you sure you want to delete this server? This will delete all files and configuration. This action is irreversible.")) {
                        deleteServer(id);
                    }
                });
            });
        }
    }

    btnQuickCreate.addEventListener('click', () => switchTab('create'));
    btnCreateFirstServer.addEventListener('click', () => switchTab('create'));

    // --- CREATE SERVER ---
    srvRamSlider.addEventListener('input', () => {
        srvRamVal.textContent = srvRamSlider.value + " MB";
    });

    srvDiskSlider.addEventListener('input', () => {
        srvDiskVal.textContent = srvDiskSlider.value + " GB";
    });

    btnCancelCreate.addEventListener('click', () => switchTab('overview'));

    createServerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const allocated = calculateAllocatedResources();
        const ramInput = parseInt(srvRamSlider.value);
        const diskInput = parseInt(srvDiskSlider.value);
        
        if (state.servers.length >= state.user.maxSlots) {
            alert(`You have reached your server slots limit (${state.user.maxSlots}).`);
            return;
        }

        if (allocated.ram + ramInput > state.user.ramLimit) {
            alert(`Not enough allocated RAM. Remaining: ${state.user.ramLimit - allocated.ram} MB.`);
            return;
        }

        if (!isSimulationMode) {
            btnDiscordLogin.disabled = true; // prevent double clicking
            const btnSubmit = document.getElementById('btn-submit-create');
            btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Deploying...`;
            
            try {
                const res = await fetch(`${API_URL}/api/servers`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: srvNameInput.value,
                        egg_type: srvEggSelect.value,
                        ram: ramInput,
                        disk: diskInput
                    }),
                    credentials: 'include'
                });
                
                if (res.ok) {
                    alert("Server deployed successfully on Pterodactyl!");
                    srvNameInput.value = '';
                    await refreshServersData();
                    updateGlobalResources();
                    switchTab('overview');
                } else {
                    const errData = await res.json();
                    alert(`Error: ${errData.error}`);
                }
            } catch (err) {
                alert("Failed to reach game backend server.");
            } finally {
                btnSubmit.innerHTML = `<i class="fa-solid fa-circle-plus"></i> Deploy Server`;
            }
        } else {
            // Mock deploy
            const newServer = {
                id: Math.random().toString(36).substring(2, 11),
                name: srvNameInput.value,
                egg: srvEggSelect.value,
                version: srvVersionSelect.value,
                ram: ramInput,
                disk: diskInput,
                cpu: 100,
                port: Math.floor(10000 + Math.random() * 50000),
                status: 'running'
            };

            state.servers.push(newServer);
            saveState();
            updateGlobalResources();
            srvNameInput.value = '';
            alert("Mock server deployed successfully!");
            switchTab('overview');
        }
    });

    async function deleteServer(id) {
        if (!isSimulationMode) {
            alert("To delete servers in production, use Pterodactyl administrative dashboard panel. DB syncing is automated.");
        } else {
            state.servers = state.servers.filter(srv => srv.id !== id);
            saveState();
            updateGlobalResources();
            renderOverviewTab();
        }
    }

    // --- REWARDS TAB ---
    function renderRewardsTab() {
        rewardsInviteCount.textContent = state.user.invites;
        rewardsRamCap.textContent = (state.user.ramLimit / 1024).toFixed(1) + " GB";

        rewardsGrid.innerHTML = '';
        
        rewardsConfig.forEach(m => {
            const isUnlocked = state.user.invites >= m.required;
            const isClaimed = state.user.claimedMilestones.includes(m.required);
            
            let cardClass = '';
            let badgeText = 'Locked';
            let badgeClass = 'locked-badge';
            let btnActionHtml = '';

            if (isClaimed) {
                cardClass = 'claimed';
                badgeText = 'Claimed';
                badgeClass = 'claimed-badge';
                btnActionHtml = `<button class="btn btn-outline btn-sm" disabled><i class="fa-solid fa-circle-check"></i> Redeemed</button>`;
            } else if (isUnlocked) {
                cardClass = 'unlocked';
                badgeText = 'Claimable';
                badgeClass = 'unlocked-badge';
                btnActionHtml = `<button class="btn btn-primary btn-sm btn-claim-milestone" data-milestone="${m.required}">Claim Resource</button>`;
            } else {
                badgeText = 'Locked';
                badgeClass = 'locked-badge';
                btnActionHtml = `<button class="btn btn-outline btn-sm" disabled><i class="fa-solid fa-lock"></i> Locked</button>`;
            }

            const card = document.createElement('div');
            card.className = `reward-card glass ${cardClass}`;
            
            card.innerHTML = `
                <span class="reward-badge-top ${badgeClass}">${badgeText}</span>
                <div class="reward-card-info">
                    <h3>${m.required} Invites</h3>
                    <p>${m.desc}</p>
                </div>
                
                <div class="reward-card-footer">
                    <span class="reward-progress-text text-secondary">${state.user.invites} / ${m.required} Invites</span>
                    ${btnActionHtml}
                </div>
            `;
            
            rewardsGrid.appendChild(card);
        });

        document.querySelectorAll('.btn-claim-milestone').forEach(btn => {
            btn.addEventListener('click', () => {
                const milestone = parseInt(btn.getAttribute('data-milestone'));
                claimReward(milestone);
            });
        });
    }

    async function claimReward(milestone) {
        if (!isSimulationMode) {
            try {
                const res = await fetch(`${API_URL}/api/rewards/claim`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ milestone }),
                    credentials: 'include'
                });
                
                if (res.ok) {
                    const data = await res.json();
                    state.user.ramLimit = data.ram_limit_mb;
                    state.user.maxSlots = data.max_server_slots;
                    state.user.claimedMilestones.push(milestone);
                    updateGlobalResources();
                    renderRewardsTab();
                    alert("Milestone claimed successfully!");
                } else {
                    const err = await res.json();
                    alert(`Error: ${err.error}`);
                }
            } catch (err) {
                alert("Failed to contact game backend.");
            }
        } else {
            // Mock claim
            const reward = rewardsConfig.find(r => r.required === milestone);
            if (!reward) return;

            state.user.claimedMilestones.push(milestone);
            if (reward.rewardType === 'ram') {
                state.user.ramLimit += reward.value;
            } else if (reward.rewardType === 'slots') {
                state.user.maxSlots += reward.value;
            }

            saveState();
            updateGlobalResources();
            renderRewardsTab();
            alert(`Claimed milestone! RAM capacities increased.`);
        }
    }

    // --- REFERRAL COPY ---
    btnCopyReferral.addEventListener('click', () => {
        referralLink.select();
        referralLink.setSelectionRange(0, 99999);
        navigator.clipboard.writeText(referralLink.value);
        
        btnCopyReferral.innerHTML = `<i class="fa-solid fa-check"></i> Copied`;
        setTimeout(() => {
            btnCopyReferral.innerHTML = `<i class="fa-regular fa-copy"></i> Copy`;
        }, 2000);
    });

    // --- SIMULATE ACTIONS (Only active in simulator mode) ---
    btnSimInvite.addEventListener('click', () => {
        if (!isSimulationMode) {
            alert("Simulation commands are disabled when running in production backend mode.");
            return;
        }
        state.user.invites += 1;
        saveState();
        updateGlobalResources();
        renderRewardsTab();
    });

    btnSimReset.addEventListener('click', () => {
        if (!isSimulationMode) {
            alert("Simulation commands are disabled when running in production backend mode.");
            return;
        }
        if (confirm("Reset invites data? Your claimed resources and servers will be cleared.")) {
            state.user.invites = 0;
            state.user.ramLimit = 2048;
            state.user.maxSlots = 1;
            state.user.claimedMilestones = [];
            state.servers = [];
            saveState();
            updateGlobalResources();
            renderRewardsTab();
            renderOverviewTab();
        }
    });

    // --- CONSOLE CONTROL ---
    function openConsoleForServer(serverId) {
        activeConsoleServerId = serverId;
        switchTab('console');
        
        const srv = state.servers.find(s => s.id === serverId);
        if (!srv) return;

        const srvName = srv.name;
        consoleServerName.textContent = srvName;
        
        const srvRam = srv.ram_mb || srv.ram;
        const srvStatus = srv.status || 'offline';
        
        updateConsoleStatusDisplay(srvStatus);
        consoleTerminal.innerHTML = '';

        if (!isSimulationMode) {
            // Real setup displays a connecting status
            logToTerminal(`[System] Initializing proxy connection with Pterodactyl container...`, 'system');
            
            if (srvStatus === 'running') {
                logToTerminal(`[System] Node-01 connection established. Socket online.`, 'system');
                logToTerminal(`[Server thread/INFO]: Server is running. Console outputs require active websocket streams.`, 'info');
                logToTerminal(`[Server thread/INFO]: Standard Minecraft port is open on ${srv.port || 25565}.`, 'info');
                enableConsoleInputs(true);
                setTelemetryValues(15, Math.floor(srvRam * 0.45), srvRam);
            } else {
                logToTerminal(`[System] Server container is currently offline. Press Start to boot.`, 'system');
                enableConsoleInputs(false);
                setTelemetryValues(0, 0, srvRam);
            }
        } else {
            // Simulator
            if (srvStatus === 'running') {
                logToTerminal(`[System] Connection established with Node-01.`, 'system');
                logToTerminal(`[Server thread/INFO]: Generating world chunks...`, 'info');
                logToTerminal(`[Server thread/INFO]: Done! Server listening on port ${srv.port}`, 'info');
                enableConsoleInputs(true);
                startSimulatedTelemetry(srv);
            } else {
                logToTerminal(`[System] Server is offline. Click "Start" to boot.`, 'system');
                enableConsoleInputs(false);
                setTelemetryValues(0, 0, srvRam);
            }
        }
    }

    function logToTerminal(text, type = 'info') {
        const line = document.createElement('div');
        line.className = `terminal-line ${type}`;
        const now = new Date();
        const timeStr = now.toTimeString().split(' ')[0];
        line.textContent = `[${timeStr}] ${text}`;
        consoleTerminal.appendChild(line);
        consoleTerminal.scrollTop = consoleTerminal.scrollHeight;
    }

    function updateConsoleStatusDisplay(status) {
        consoleStatusIndicator.className = 'status-indicator';
        consoleStatusIndicator.classList.add(status === 'running' ? 'online' : 'offline');
    }

    function enableConsoleInputs(enable) {
        consoleCmdInput.disabled = !enable;
        btnSendCmd.disabled = !enable;
    }

    function setTelemetryValues(cpu, ramUsage, maxRam) {
        const circumference = 314;
        
        const ramPercent = Math.min(100, Math.floor((ramUsage / maxRam) * 100));
        consoleRamPercent.textContent = ramPercent + '%';
        consoleRamText.textContent = `${ramUsage} MB / ${maxRam} MB`;
        const ramOffset = circumference - (ramPercent / 100) * circumference;
        ramCircleFill.style.strokeDashoffset = ramOffset;

        consoleCpuPercent.textContent = cpu + '%';
        const cpuOffset = circumference - (cpu / 100) * circumference;
        cpuCircleFill.style.strokeDashoffset = cpuOffset;
    }

    function startSimulatedTelemetry(srv) {
        clearInterval(consoleInterval);
        
        consoleInterval = setInterval(() => {
            if (srv.status !== 'running') {
                clearInterval(consoleInterval);
                return;
            }
            const srvRam = srv.ram_mb || srv.ram;
            const randomCpu = Math.floor(20 + Math.random() * 40);
            const randomRam = Math.floor(srvRam * 0.4 + Math.random() * (srvRam * 0.2));
            
            setTelemetryValues(randomCpu, randomRam, srvRam);
        }, 3000);
    }

    // Power Actions
    btnConsoleStart.addEventListener('click', () => {
        handlePowerAction('start');
    });

    btnConsoleStop.addEventListener('click', () => {
        handlePowerAction('stop');
    });

    btnConsoleRestart.addEventListener('click', () => {
        handlePowerAction('restart');
    });

    async function handlePowerAction(action) {
        if (!activeConsoleServerId) return;
        const srv = state.servers.find(s => s.id === activeConsoleServerId);
        if (!srv) return;

        const srvRam = srv.ram_mb || srv.ram;

        if (!isSimulationMode) {
            logToTerminal(`[System] Sending power command [${action.toUpperCase()}] to Pterodactyl...`, 'system');
            try {
                const res = await fetch(`${API_URL}/api/servers/${activeConsoleServerId}/power`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action }),
                    credentials: 'include'
                });
                
                if (res.ok) {
                    const data = await res.json();
                    srv.status = data.status;
                    updateConsoleStatusDisplay(data.status);
                    
                    if (data.status === 'running') {
                        logToTerminal(`[System] Server signal received. Booting core container.`, 'system');
                        enableConsoleInputs(true);
                        setTelemetryValues(18, Math.floor(srvRam * 0.48), srvRam);
                    } else {
                        logToTerminal(`[System] Server signal received. Shutting down container.`, 'system');
                        enableConsoleInputs(false);
                        setTelemetryValues(0, 0, srvRam);
                    }
                } else {
                    const err = await res.json();
                    logToTerminal(`[Error] API responded: ${err.error}`, 'error');
                }
            } catch (err) {
                logToTerminal(`[Error] Failed to communicate with game panel backend.`, 'error');
            }
        } else {
            // Simulator
            if (action === 'start') {
                if (srv.status === 'running') return;
                srv.status = 'running';
                updateConsoleStatusDisplay('running');
                logToTerminal(`[System] Initializing server boot...`, 'system');
                setTimeout(() => {
                    logToTerminal(`[Server thread/INFO]: Starting Minecraft server...`, 'info');
                    enableConsoleInputs(true);
                    startSimulatedTelemetry(srv);
                }, 1000);
            } else if (action === 'stop') {
                if (srv.status === 'offline') return;
                srv.status = 'offline';
                updateConsoleStatusDisplay('offline');
                logToTerminal(`[Server thread/INFO]: Saving chunks...`, 'info');
                logToTerminal(`[System] Server stopped.`, 'system');
                enableConsoleInputs(false);
                clearInterval(consoleInterval);
                setTelemetryValues(0, 0, srvRam);
            } else if (action === 'restart') {
                handlePowerAction('stop');
                setTimeout(() => handlePowerAction('start'), 1500);
            }
        }
    }

    // Command Input
    function sendConsoleCommand() {
        const cmd = consoleCmdInput.value.trim();
        if (!cmd) return;

        logToTerminal(`> ${cmd}`, 'system');
        consoleCmdInput.value = '';

        if (!isSimulationMode) {
            logToTerminal(`[System] Sending commands to panel API is mapped. Verify SSH/Websocket keys.`, 'system');
        } else {
            setTimeout(() => {
                if (cmd.startsWith('op ')) {
                    logToTerminal(`[Server thread/INFO]: Opped ${cmd.substring(3)}`, 'info');
                } else if (cmd === 'list') {
                    logToTerminal(`[Server thread/INFO]: Online: Steve, Alex, Notch`, 'info');
                } else {
                    logToTerminal(`[Server thread/INFO]: Command processed.`, 'info');
                }
            }, 300);
        }
    }

    btnSendCmd.addEventListener('click', sendConsoleCommand);
    consoleCmdInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            sendConsoleCommand();
        }
    });

    // Run!
    init();
});
