// server/server.js

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");
const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// --- DATABASE CONNECTION ---
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: 5432,
});

pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error("❌ Database connection error", err.stack);
    } else {
        console.log("✅ Database connected successfully:", res.rows[0].now);
    }
});

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const PORT = 3000;

// --- API MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.sendStatus(403);
        req.userId = decoded.userId;
        next();
    });
};

// --- API ROUTES ---
app.post('/api/auth/register', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password are required." });
    try {
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);
        const newUserResult = await pool.query('INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING user_id, email', [email, password_hash]);
        res.status(201).json(newUserResult.rows[0]);
    } catch (err) {
        if (err.code === '23505') return res.status(409).json({ message: "Email already in use." });
        console.error("Registration Error:", err);
        res.status(500).json({ message: "Server error during registration." });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userResult.rowCount === 0) return res.status(401).json({ message: "Invalid credentials." });
        const user = userResult.rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) return res.status(401).json({ message: "Invalid credentials." });
        const payload = { userId: user.user_id, email: user.email };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user.user_id, email: user.email } });
    } catch (err) {
        console.error("Login Error:", err);
        res.status(500).json({ message: "Server error during login." });
    }
});

app.post('/session/create', async (req, res) => {
    const sessionId = uuidv4();
    try {
        await pool.query('INSERT INTO sessions(session_id) VALUES($1)', [sessionId]);
        console.log(`✨ New session created: ${sessionId}`);
        res.json({ sessionId: sessionId });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

app.get('/api/sessions', authenticateToken, async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT s.session_id, s.url, p.joined_at FROM sessions s JOIN session_participants p ON s.session_id = p.session_id WHERE p.user_id = $1 AND s.url IS NOT NULL ORDER BY p.joined_at DESC LIMIT 10`, [req.userId]);
        res.json(rows);
    } catch (err) {
        console.error("Error fetching session history:", err);
        res.status(500).json({ message: "Server error" });
    }
});

app.get('/comments/:highlightId', async (req, res) => {
    try {
        const { highlightId } = req.params;
        const { rows } = await pool.query(`SELECT c.*, u.email as author_email FROM comments c JOIN users u ON c.user_id = u.user_id WHERE c.highlight_id = $1 ORDER BY c.created_at ASC`, [highlightId]);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});


// --- REAL-TIME LOGIC (CORRECTED ARCHITECTURE) ---
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('join-session', async ({ sessionId, url, token }) => {
        socket.currentSessionId = sessionId;
        socket.join(sessionId);

        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                socket.userId = decoded.userId;
                console.log(`Authenticated user ${socket.userId} (socket: ${socket.id}) joined session: ${sessionId}`);
                
                await pool.query('UPDATE sessions SET url = $1 WHERE session_id = $2 AND url IS NULL', [url, sessionId]);
                await pool.query(`INSERT INTO session_participants (user_id, session_id) VALUES ($1, $2) ON CONFLICT (user_id, session_id) DO NOTHING`, [socket.userId, sessionId]);
            } catch (err) {
                console.warn(`Socket ${socket.id} provided an invalid token. Treating as anonymous.`);
            }
        } else {
            console.log(`Anonymous socket ${socket.id} joined session: ${sessionId}`);
        }
    });

    // --- NEW: Handle Remote Clicks ---
    socket.on('user-click', (data) => {
        if (socket.currentSessionId) {
            // Just broadcast it to everyone else in the room
            socket.to(socket.currentSessionId).emit('remote-click-show', data);
        }
    });

    // --- NEW: Handle Remote Scrolls ---
    socket.on('user-scroll', (data) => {
        if (socket.currentSessionId) {
            // Just broadcast it to everyone else in the room
            socket.to(socket.currentSessionId).emit('remote-scroll-update', data);
        }
    });

    socket.on('mouse-move', (data) => {
        if (socket.currentSessionId) {
            socket.to(socket.currentSessionId).emit('mouse-move-remote', data);
        }
    });

    socket.on('new-highlight', async (highlightData) => {
        // ACTION: Check if the user is authenticated before proceeding.
        if (!socket.currentSessionId || !socket.userId) {
            console.log(`Action denied: Anonymous socket ${socket.id} tried to highlight.`);
            return; 
        }
    
        const highlightId = highlightData[0].highlightId;
        try {
            // THE FIX: Add the user_id to the INSERT statement.
            await pool.query(
                'INSERT INTO highlights(highlight_id, session_id, user_id) VALUES($1, $2, $3) ON CONFLICT (highlight_id) DO NOTHING', 
                [highlightId, socket.currentSessionId, socket.userId]
            );
            
            // This line will now be reached successfully.
            socket.to(socket.currentSessionId).emit('remote-highlight', highlightData);
        } catch (err) { 
            console.error('Error saving highlight:', err); 
        }
    });

    socket.on('new-comment', async ({ highlightId, text }) => {
        if (!socket.currentSessionId || !socket.userId) {
            console.log(`Action denied: Socket ${socket.id} is not authenticated.`);
            return;
        }
        try {
            const result = await pool.query('INSERT INTO comments(highlight_id, comment_text, user_id) VALUES($1, $2, $3) RETURNING *', [highlightId, text, socket.userId]);
            const newComment = result.rows[0];
            const authorResult = await pool.query('SELECT email FROM users WHERE user_id = $1', [newComment.user_id]);
            const payload = { ...newComment, author_email: authorResult.rows[0].email };
            io.in(socket.currentSessionId).emit('comment-added', payload);
        } catch (err) { console.error('Error saving comment:', err); }
    });

    socket.on('delete-highlight', async ({ highlightId }) => {
        if (!socket.currentSessionId || !socket.userId) {
            console.log(`Action denied: Socket ${socket.id} is not authenticated.`);
            return;
        }
        try {
            // A more secure check would verify highlight ownership here
            await pool.query('DELETE FROM highlights WHERE highlight_id = $1', [highlightId]);
            io.in(socket.currentSessionId).emit('highlight-deleted', { highlightId });
            console.log(`Highlight ${highlightId} deleted by user ${socket.userId}`);
        } catch(err) { console.error("Error deleting highlight:", err); }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });

    socket.on('user-navigated', ({ newUrl }) => {
        if (socket.currentSessionId) {
            // First, update the session's canonical URL in the database
            pool.query('UPDATE sessions SET url = $1 WHERE session_id = $2', [newUrl, socket.currentSessionId]);
            
            // --- THE FIX ---
            // Construct the full, shareable URL for redirection
            const redirectUrl = new URL(newUrl);
            redirectUrl.searchParams.set('jamSessionId', socket.currentSessionId);
    
            // Broadcast the complete redirect URL to everyone else
            socket.to(socket.currentSessionId).emit('force-redirect', { newUrlWithSession: redirectUrl.toString() });
            console.log(`Broadcasting redirect for session ${socket.currentSessionId} to ${redirectUrl.toString()}`);
        }
    });
});

server.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));