// extension/content.js
console.log("Browser Jam Extension Loaded! v9 - Sticky Sessions");

const urlParams = new URLSearchParams(window.location.search);
const sessionId = urlParams.get('jamSessionId');

// extension/content.js (More Debuggable)

(async function main() {
    console.log("--- Browser Jam Initializing ---");

    const urlParams = new URLSearchParams(window.location.search);
    let sessionIdFromUrl = urlParams.get('jamSessionId');
    console.log("Session ID from URL:", sessionIdFromUrl || "None");

    const getActiveSessionFromStorage = () => {
        return new Promise(resolve => {
            console.log("Requesting active session from background script...");
            chrome.runtime.sendMessage({ action: "getActiveSession" }, response => {
                // This is a CRITICAL check. If the background script has an error, response might be undefined.
                if (chrome.runtime.lastError) {
                    console.error("Error getting session from storage:", chrome.runtime.lastError.message);
                    resolve(null);
                } else {
                    console.log("Received response from background script:", response);
                    resolve(response ? response.activeSession : null);
                }
            });
        });
    };
    
    let activeSession = await getActiveSessionFromStorage();
    console.log("Session ID from Storage:", activeSession ? activeSession.id : "None");

    let finalSessionId = null;

    if (sessionIdFromUrl) {
        console.log("URL has priority. Using session ID from URL.");
        finalSessionId = sessionIdFromUrl;
        
        if (!activeSession || activeSession.id !== finalSessionId) {
            console.log("Updating session storage with new ID from URL...");
            const sessionData = { id: finalSessionId, url: window.location.href.split('?')[0] };
            chrome.runtime.sendMessage({ action: "setActiveSession", sessionData });
        }
    } else if (activeSession) {
        console.log("No URL param. Using sticky session ID from storage.");
        finalSessionId = activeSession.id;
    }

    console.log("Final Session ID to be used:", finalSessionId || "None");

    if (finalSessionId) {
        // We pass a boolean to tell initializeSession if this is the first page load for this session
        // or a subsequent navigation.
        initializeSession(finalSessionId, !!sessionIdFromUrl);
    } else {
        console.log("--- Browser Jam Idle ---");
    }

})();

function initializeSession(sessionId,isInitialJoin) {
    // --- 1. CREATE UI ELEMENTS ---
    const commentBox = document.createElement('div');
    commentBox.id = 'browser-jam-comment-box';
    commentBox.style.position = 'absolute';
    commentBox.style.border = '1px solid #ccc';
    commentBox.style.borderRadius = '4px';
    commentBox.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    commentBox.style.backgroundColor = 'white';
    commentBox.style.padding = '10px';
    commentBox.style.width = '250px';
    commentBox.style.zIndex = '1000000';
    commentBox.style.display = 'none';
    commentBox.innerHTML = `
        <div id="comment-list" style="margin-bottom: 10px; max-height: 150px; overflow-y: auto; font-family: sans-serif; font-size: 14px;"></div>
        <textarea placeholder="Add a comment..." style="width: 95%; height: 50px; border: 1px solid #ccc; border-radius: 3px;"></textarea>
        <br>
        <div style="margin-top: 5px; display: flex; justify-content: space-between;">
            <button id="submit-comment-btn" style="background-color: #4CAF50; color: white; border: none; padding: 8px 12px; border-radius: 3px; cursor: pointer;">Submit</button>
            <button id="delete-highlight-btn" style="background-color: #db4437; color: white; border: none; padding: 8px 12px; border-radius: 3px; cursor: pointer; display: none;">Delete All</button>
        </div>
    `;
    document.body.appendChild(commentBox);
    const commentList = document.getElementById('comment-list');
    const deleteHighlightBtn = document.getElementById('delete-highlight-btn');
    

    let ghostCursor = document.getElementById('ghost-cursor');
    if (!ghostCursor) {
        ghostCursor = document.createElement('div');
        ghostCursor.id = 'ghost-cursor';
        ghostCursor.style.position = 'fixed';
        ghostCursor.style.width = '20px';
        ghostCursor.style.height = '20px';
        ghostCursor.style.backgroundColor = 'blue';
        ghostCursor.style.borderRadius = '50%';
        ghostCursor.style.pointerEvents = 'none';
        ghostCursor.style.zIndex = '999999';
        ghostCursor.style.opacity = '0.5';
        document.body.appendChild(ghostCursor);
    }

    // --- 2. ESTABLISH REAL-TIME CONNECTION ---
    const socket = io("http://localhost:3000");

    socket.on('connect', () => {
        console.log(`✅ Connected to server. Joining session: ${sessionId}`);
        chrome.runtime.sendMessage({ action: "getToken" }, (response) => {
            socket.emit('join-session', {
                sessionId: sessionId,
                url: window.location.href.split('?')[0],
                token: response ? response.token : null
            });
        });
        if (!isInitialJoin) {
            const newUrl = window.location.href.split('?')[0];
            // THIS IS THE MISSING PIECE OF THE PUZZLE
            socket.emit('user-navigated', { newUrl: newUrl }); 
        }
    });

    socket.on('disconnect', () => console.log("❌ Disconnected from server"));

    // --- 3. HANDLE REAL-TIME EVENTS FROM SERVER ---
    socket.on('mouse-move-remote', (data) => {
        ghostCursor.style.left = data.x + 'px';
        ghostCursor.style.top = data.y + 'px';
    });
    
    socket.on('remote-highlight', (highlightData) => {
        deserializeV2(highlightData);
    });

    socket.on('highlight-deleted', ({ highlightId }) => {
        document.querySelectorAll(`[data-highlight-id="${highlightId}"]`).forEach(span => {
            const parent = span.parentNode;
            while (span.firstChild) {
                parent.insertBefore(span.firstChild, span);
            }
            if (parent) parent.removeChild(span);
        });
        if (commentBox.dataset.activeHighlightId === highlightId) {
            commentBox.style.display = 'none';
        }
    });

    socket.on('force-redirect', ({ newUrlWithSession }) => {
        // Prevent redirecting if we are already on the correct page
        if (window.location.href !== newUrlWithSession) {
            console.log(`Redirecting to presenter's page: ${newUrlWithSession}`);
            window.location.href = newUrlWithSession;
        }
    });

    socket.on('comment-added', (newComment) => {
        if (commentBox.style.display === 'block' && commentBox.dataset.activeHighlightId === newComment.highlight_id) {
            appendComment(newComment);
        }
    });

    socket.on('remote-click-show', (data) => {
        // Create the ripple element
        const ripple = document.createElement('div');
        ripple.className = 'browser-jam-ripple';
        ripple.style.position = 'absolute';
        ripple.style.left = `${data.x}px`;
        ripple.style.top = `${data.y}px`;
        ripple.style.transform = 'translate(-50%, -50%)'; // Center it on the cursor
        ripple.style.border = '2px solid red';
        ripple.style.width = '30px';
        ripple.style.height = '30px';
        ripple.style.borderRadius = '50%';
        ripple.style.pointerEvents = 'none';
        ripple.style.zIndex = '99999999';
        ripple.style.transition = 'all 0.5s ease-out';
        
        document.body.appendChild(ripple);
    
        // Animate and remove the ripple
        setTimeout(() => {
            ripple.style.transform = 'translate(-50%, -50%) scale(2.5)';
            ripple.style.opacity = '0';
        }, 10); // Start animation on next frame
    
        setTimeout(() => {
            ripple.remove();
        }, 510); // Remove after animation ends
    });

    let isScrollingRemotely = false; // Flag to prevent infinite scroll loops
    let scrollTimeoutId = null; // <-- NEW: To manage the timeout
    socket.on('remote-scroll-update', (data) => {
        isScrollingRemotely = true;
        
        // Clear any previous timeout to reset the grace period
        if (scrollTimeoutId) {
            clearTimeout(scrollTimeoutId);
        }
        
        // Calculate the target scroll position based on the reliable ratio
        const targetScrollY = data.scrollTopRatio * (document.documentElement.scrollHeight - window.innerHeight);
    
        window.scrollTo({
            top: targetScrollY,
            behavior: 'smooth'
        });
    
        // Set a timeout to reset the flag. If another remote event comes in,
        // this timeout will be cleared and a new one will be set.
        scrollTimeoutId = setTimeout(() => {
            isScrollingRemotely = false;
        }, 150); // A shorter, more responsive timeout is better
    });

    // --- IMPORTANT: Update our own scroll listener to respect the flag ---
    // Find your existing scroll listener and add the check

    // --- 4. HANDLE USER INTERACTIONS & EMIT TO SERVER ---
    document.addEventListener('mousemove', (event) => {
        socket.emit('mouse-move', { x: event.clientX, y: event.clientY });
    });
    
    document.addEventListener('mouseup', () => {
        const highlightData = serializeV2();
        if (highlightData && highlightData.length > 0) {
            socket.emit('new-highlight', highlightData);
            deserializeV2(highlightData);
        }
    });

    document.addEventListener('click', (event) => {
        // We only want to send clicks on the main body, not on our own UI
        if (event.target.closest('#browser-jam-comment-box')) {
            return; // Don't emit clicks inside the comment box
        }
        socket.emit('user-click', { x: event.clientX, y: event.clientY });
    });
    
    // --- NEW: Listen for local scrolls and emit them (with throttling) ---
    let lastScrollTime = 0;
    window.addEventListener('scroll', () => {
        // If the flag is set, it means this scroll event was caused by our code. Ignore it.
        if (isScrollingRemotely) {
            return;
        }
    
        const now = Date.now();
        // Throttle to prevent flooding the server
        if (now - lastScrollTime > 100) {
            // Use a fallback of 1 for the denominator to prevent division by zero on non-scrollable pages
            const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
            const ratio = scrollableHeight > 0 ? window.scrollY / scrollableHeight : 0;
            
            socket.emit('user-scroll', { 
                scrollTopRatio: ratio
            });
            lastScrollTime = now;
        }
    }, { passive: true });

    document.getElementById('submit-comment-btn').addEventListener('click', () => {
        const highlightId = commentBox.dataset.activeHighlightId;
        const text = commentBox.querySelector('textarea').value;
        if (highlightId && text.trim() !== '') {
            socket.emit('new-comment', { highlightId, text });
            commentBox.querySelector('textarea').value = '';
        }
    });

    deleteHighlightBtn.addEventListener('click', () => {
        const highlightId = commentBox.dataset.activeHighlightId;
        if (highlightId && confirm('Are you sure you want to delete this highlight and all its comments?')) {
            socket.emit('delete-highlight', { highlightId });
        }
    });

    document.body.addEventListener('click', async (event) => {
        const highlight = event.target.closest('.browser-jam-highlight');
        if (highlight) {
            const highlightId = highlight.dataset.highlightId;
            commentBox.dataset.activeHighlightId = highlightId;
            try {
                const response = await fetch(`http://localhost:3000/comments/${highlightId}`);
                const comments = await response.json();
                renderComments(comments);
            } catch (err) { console.error("Error fetching comments:", err); }
            const rect = highlight.getBoundingClientRect();
            commentBox.style.left = `${window.scrollX + rect.left}px`;
            commentBox.style.top = `${window.scrollY + rect.bottom + 5}px`;
            commentBox.style.display = 'block';
            commentBox.querySelector('textarea').focus();
        } else if (event.target.closest('#browser-jam-comment-box') === null) {
            commentBox.style.display = 'none';
        }
    });
    
    // --- 5. HELPER FUNCTIONS ---
    function renderComments(comments) {
        commentList.innerHTML = '';
        if (comments.length === 0) {
            commentList.innerHTML = `<p style="color: #888; font-style: italic;">No comments yet.</p>`;
        } else {
            comments.forEach(appendComment);
        }

        chrome.runtime.sendMessage({ action: "getToken" }, (response) => {
            if (response && response.user) {
                const currentUserIsAuthor = comments.some(c => c.user_id === response.user.id);
                deleteHighlightBtn.style.display = currentUserIsAuthor ? 'inline-block' : 'none';
            } else {
                deleteHighlightBtn.style.display = 'none';
            }
        });
    }

    function appendComment(comment) {
        const emptyMsg = commentList.querySelector('p[style*="italic"]');
        if (emptyMsg) emptyMsg.remove();
        
        const commentEl = document.createElement('div');
        commentEl.style.borderBottom = '1px solid #eee';
        commentEl.style.padding = '5px 0';
        const safeText = comment.comment_text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const safeEmail = comment.author_email.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        commentEl.innerHTML = `
            <p style="margin: 0; font-size: 13px; word-wrap: break-word;">${safeText}</p>
            <small style="color: #999;">By: <strong>${safeEmail}</strong> at ${new Date(comment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
        `;
        commentList.appendChild(commentEl);
        commentList.scrollTop = commentList.scrollHeight;
    }
}