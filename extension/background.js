// extension/background.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getToken") {
        chrome.storage.local.get(['token', 'user'], (result) => {
            if (chrome.runtime.lastError) {
                sendResponse({ error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ token: result.token, user: result.user }); // Send user object too
            }
        });
        return true;
    }

    if (request.action === "setActiveSession") {
        chrome.storage.session.set({ activeSession: request.sessionData }, () => {
            sendResponse({ success: true });
        });
        return true;
    }

    if (request.action === "getActiveSession") {
        chrome.storage.session.get(['activeSession'], (result) => {
            sendResponse({ activeSession: result.activeSession });
        });
        return true;
    }
    
    if (request.action === "clearActiveSession") {
        chrome.storage.session.remove('activeSession', () => {
            sendResponse({ success: true });
        });
        return true;
    }
});