const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');

const app = express();
const DEFAULT_PORT = Number(process.env.PORT || 3000);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (uploads, heatmaps, and profile_picture)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/heatmaps', express.static(path.join(__dirname, 'heatmaps')));
app.use('/profile_picture', express.static(path.join(__dirname, 'profile_picture')));

// Ensure database schema is up to date
const ensureSchema = require('./database/ensureSchema');
ensureSchema();

// Import Routes
const authRoutes = require('./routes/authRoutes');
const predictRoutes = require('./routes/predictRoutes');
const historyRoutes = require('./routes/historyRoutes');

// Use Routes
app.use('/api/auth', authRoutes);
app.use('/api', predictRoutes);
app.use('/api/history', historyRoutes);

// Base route
app.get('/', (req, res) => {
    res.json({ message: 'Skin Disease Detection API is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!', details: err.message });
});

function startServer(port) {
    const server = app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`Port ${port} is already in use. Retrying on ${port + 1}...`);
            startServer(port + 1);
        } else {
            console.error('Failed to start server:', err);
            process.exit(1);
        }
    });
}

startServer(DEFAULT_PORT);
