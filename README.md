
# Browser Jam

[![Status](https://img.shields.io/badge/status-active-success.svg)]()

Browser Jam is a powerful Chrome extension that transforms any webpage into a real-time, shared collaborative workspace. It allows teams, study groups, or friends to browse, highlight, comment, and interact on the same page simultaneously, eliminating the friction of traditional screen-sharing sessions.

  <!-- It's highly recommended to create a short GIF demo and replace this link -->

---

## The Problem It Solves

Discussing online content with a group is often a clunky experience. You jump on a video call, one person shares their screen, and the rest of the team passively watches. Pointing things out involves awkward verbal cues like "Can you scroll up a bit? Yeah, that paragraph." and discussions in a separate chat window lose context.

Browser Jam fixes this by creating a multi-user layer directly on top of any website, making collaboration feel as seamless and interactive as working together in a Google Doc.

---

## Core Features

*   **Real-Time Ghost Cursors:** See where everyone's mouse is on the page in real-time.
*   **Synchronized Scrolling:** A designated presenter can scroll the page, and everyone else's browser follows along perfectly.
*   **Live Collaborative Highlighting:** When one person highlights text, it instantly appears on everyone else's screen, color-coded to the user.
*   **Contextual Commenting:** Add threaded comments directly to highlights to keep discussions organized and in context.
*   **"Attention Pointer" Clicks:** Click anywhere on the page to create a temporary ripple effect on others' screens, perfect for drawing attention to non-text elements.
*   **Sticky Sessions & Follow-Me Navigation:** The session persists across page navigations. When a presenter clicks a link, everyone else is automatically redirected to the new page.
*   **Secure User Authentication:** User accounts ensure that all comments and actions are properly attributed.
*   **Session History:** Logged-in users can easily see and rejoin their recent collaborative sessions.

---

## Tech Stack

This project is a full-stack application designed to showcase a variety of modern web technologies.

*   **Frontend (Chrome Extension):**
    *   Plain JavaScript (ES6+), HTML5, CSS3
    *   No heavy frameworks to keep the extension lightweight and fast.
*   **Backend:**
    *   **Node.js** with **Express** for the API.
    *   **Socket.IO** for real-time WebSocket communication.
    *   **PostgreSQL** for the database.
    *   **JWT (JSON Web Tokens)** for secure authentication.
    *   **bcrypt.js** for password hashing.
*   **Development Environment:**
    *   **Docker** & **Docker Compose** for running a consistent PostgreSQL database.
    *   **Nodemon** for live-reloading the backend server during development.

---

## Getting Started: Local Development Setup

Follow these steps to get Browser Jam running on your local machine.

### Prerequisites

*   **Node.js** (v18.x or later)
*   **Docker Desktop** (must be running)
*   A Chromium-based browser (Google Chrome, Brave, etc.)

### 1. Clone the Repository

```bash
git clone https://github.com/Sahith-03/browser-jam.git
cd browser-jam
```

### 2. Set Up the Backend

Navigate to the server directory and install the necessary dependencies.

```bash
cd server
npm install
```

Create a `.env` file in the `/server` directory for your secret keys. Copy the example file to get started.

```bash
cp .env.example .env
```
*(You can edit the `JWT_SECRET` in `.env` if you wish, but the default is fine for local development.)*

### 3. Launch the Database

From the **root directory** of the project (the `browser-jam/` folder), launch the PostgreSQL database using Docker Compose.

```bash
docker-compose up -d
```
The first time you run this, it will download the Postgres image. On subsequent runs, it will start the existing container instantly.

### 4. Create the Database Tables

With the Docker container running, you need to create the necessary tables. You can do this by executing the `psql` command-line tool inside the container.

```bash
# Connect to the database inside the container
docker-compose exec db psql -U myuser -d browser_jam

# You will be prompted for a password. It is: mypassword
```

Once you are inside the `psql` shell (`browser_jam=#`), copy and paste the entire contents of the `database.sql` file (or the SQL commands below) and press Enter.

```sql
-- Paste this into the psql shell
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- ... (paste all other CREATE TABLE and ALTER TABLE commands here)
```

Type `\q` to exit the `psql` shell.

### 5. Run the Backend Server

Navigate back to the `/server` directory and start the development server using nodemon.

```bash
cd server
npm run dev  # Assumes a "dev": "nodemon server.js" script in package.json
```
Your backend is now running on `http://localhost:3000`.

### 6. Load the Chrome Extension

1.  Open Chrome and navigate to `chrome://extensions`.
2.  Enable **"Developer mode"** in the top-right corner.
3.  Click the **"Load unpacked"** button.
4.  Select the `/extension` folder from this project directory.
5.  The "Browser Jam" extension should now appear in your toolbar.

---

## How to Use

1.  Click the Browser Jam icon in your Chrome toolbar.
2.  **Register** a new account and then **Log in**.
3.  Click **"Start New Session"**. A unique, shareable link will be generated.
4.  Share this link with others who also have the extension installed.
5.  When they open the link, you will be in a collaborative session together!
