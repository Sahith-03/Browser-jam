// extension/popup.js
document.addEventListener('DOMContentLoaded', () => {
    // --- Views & Forms ---
    const loggedOutView = document.getElementById('logged-out-view');
    const loggedInView = document.getElementById('logged-in-view');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    
    // --- Display Elements ---
    const userEmailSpan = document.getElementById('user-email');
    const errorMessageP = document.getElementById('error-message');
    const sessionInfoDiv = document.getElementById('session-info');
    const sessionListDiv = document.getElementById('session-list');

    // --- Buttons & Links ---
    const loginBtn = document.getElementById('login-btn');
    const registerBtn = document.getElementById('register-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const startSessionBtn = document.getElementById('start-session-btn');
    const showRegisterLink = document.getElementById('show-register-form');
    const showLoginLink = document.getElementById('show-login-form');
    
    const API_BASE_URL = 'http://localhost:3000';

    const checkLoginStatus = () => {
        errorMessageP.textContent = ''; // Clear errors on view change
        chrome.storage.local.get(['token', 'user'], ({ token, user }) => {
            if (token && user) {
                showLoggedInView(user);
            } else {
                showLoggedOutView();
            }
        });
    };

    function showLoggedInView(user) {
        userEmailSpan.textContent = user.email;
        loggedOutView.style.display = 'none';
        loggedInView.style.display = 'block';
        fetchAndRenderSessionHistory();
    }

    function showLoggedOutView() {
        loggedOutView.style.display = 'block';
        loggedInView.style.display = 'none';
    }

    async function handleApiRequest(endpoint, options) {
        try {
            const response = await fetch(endpoint, options);
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'An unknown error occurred.');
            }
            errorMessageP.textContent = ''; // Clear previous errors on success
            return data;
        } catch (err) {
            errorMessageP.textContent = err.message;
            console.error('API Request Error:', err);
            return null;
        }
    }

    async function fetchAndRenderSessionHistory() {
        sessionListDiv.innerHTML = '<p>Loading...</p>';
        
        chrome.storage.local.get(['token'], async ({ token }) => {
            if (!token) {
                sessionListDiv.innerHTML = '<p>Could not load sessions.</p>';
                return;
            }

            const data = await handleApiRequest(
                `${API_BASE_URL}/api/sessions`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                }
            );

            if (data) {
                if (data.length === 0) {
                    sessionListDiv.innerHTML = '<p>No recent sessions found.</p>';
                    return;
                }
                sessionListDiv.innerHTML = '';
                data.forEach(session => {
                    const sessionEl = document.createElement('div');
                    sessionEl.style.marginBottom = '8px';
                    const sessionUrl = new URL(session.url);
                    sessionUrl.searchParams.set('jamSessionId', session.session_id);
                    
                    sessionEl.innerHTML = `
                        <a href="${sessionUrl.toString()}" title="${sessionUrl.toString()}" style="text-decoration: none; color: #007bff; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${session.url.split('//')[1]} 
                        </a>
                        <small style="color: #666;">
                            ${new Date(session.joined_at).toLocaleString()}
                        </small>
                    `;
                    sessionEl.querySelector('a').addEventListener('click', (e) => {
                        e.preventDefault();
                        chrome.tabs.create({ url: e.target.href });
                    });
                    sessionListDiv.appendChild(sessionEl);
                });
            } else {
                sessionListDiv.innerHTML = '<p>Failed to load sessions.</p>';
            }
        });
    }

    // leaveSessionBtn.addEventListener('click', () => {
    //     // We just need to clear the storage.
    //     chrome.runtime.sendMessage({ action: "clearActiveSession" }, () => {
    //         alert("You have left the session.");
    //         // You could also reload the current tab to make the extension go idle.
    //         chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    //             chrome.tabs.reload(tabs[0].id);
    //         });
    //     });
    // });

    // --- Event Listeners ---
    showRegisterLink.addEventListener('click', () => {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        errorMessageP.textContent = '';
    });

    showLoginLink.addEventListener('click', () => {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        errorMessageP.textContent = '';
    });

    registerBtn.addEventListener('click', async () => {
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        const data = await handleApiRequest(`${API_BASE_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        if (data) {
            alert('Registration successful! Please log in.');
            showLoginLink.click(); // Switch back to login form
        }
    });

    loginBtn.addEventListener('click', async () => {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const data = await handleApiRequest(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        if (data && data.token && data.user) {
            chrome.storage.local.set({ token: data.token, user: data.user }, () => {
                checkLoginStatus();
            });
        }
    });

    logoutBtn.addEventListener('click', () => {
        chrome.storage.local.remove(['token', 'user'], () => {
            sessionInfoDiv.innerHTML = '';
            checkLoginStatus();
        });
    });
    
    startSessionBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        const currentUrl = new URL(tab.url);
        currentUrl.searchParams.delete('jamSessionId');

        const data = await handleApiRequest(`${API_BASE_URL}/session/create`, { method: 'POST' });

        if (data && data.sessionId) {
            currentUrl.searchParams.set('jamSessionId', data.sessionId);
            const sessionUrl = currentUrl.toString();
            sessionInfoDiv.innerHTML = `
                <p style="font-size: 12px;">Share this link:</p>
                <input type="text" value="${sessionUrl}" readonly />
            `;
            sessionInfoDiv.querySelector('input').select();
        }
    });

    // Initial check when the popup opens
    checkLoginStatus();
});