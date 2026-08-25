const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Serve static HTML files from root directory
app.use(express.static(__dirname));

// MongoDB Schema for Tournaments
const tournamentSchema = new mongoose.Schema({
    tournamentId: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    tournamentTitle: { type: String, required: true },
    paragraph: { type: String, default: "" }
});

const Tournament = mongoose.model('Tournament', tournamentSchema);

const mediaSchema = new mongoose.Schema({
    tournamentId: { type: String, required: true },
    number: { type: Number, required: true, min: 1 },
    url: { type: String, required: true },
    resourceType: { type: String, required: true, enum: ['image', 'video', 'raw'] },
    originalName: { type: String, required: true }
}, { timestamps: true });

mediaSchema.index({ tournamentId: 1, number: 1 }, { unique: true });
const Media = mongoose.model('Media', mediaSchema);

// --- API ENDPOINTS ---

// 1. Register Tournament
app.post('/api/register', async (req, res) => {
    try {
        const { tournamentId, password, tournamentTitle } = req.body;
        
        const existing = await Tournament.findOne({ tournamentId });
        if (existing) {
            return res.status(400).json({ message: 'Tournament ID already exists!' });
        }

        const newTournament = new Tournament({ tournamentId, password, tournamentTitle });
        await newTournament.save();
        res.status(201).json({ message: 'Registration successful!' });
    } catch (err) {
        res.status(500).json({ message: 'Server error during registration' });
    }
});

// 2. Login
app.post('/api/login', async (req, res) => {
    try {
        const { tournamentId, password, role } = req.body;
        const tournament = await Tournament.findOne({ tournamentId });

        if (!tournament) {
            return res.status(404).json({ message: 'Tournament ID not found' });
        }

        if (role === 'Admin') {
            if (tournament.password !== password) {
                return res.status(401).json({ message: 'Incorrect Admin password' });
            }
        }

        res.json({ message: 'Login successful', tournamentId: tournament.tournamentId });
    } catch (err) {
        res.status(500).json({ message: 'Server error during login' });
    }
});

// 3. Get Tournament Info
app.get('/api/tournament/:id', async (req, res) => {
    try {
        const tournament = await Tournament.findOne({ tournamentId: req.params.id });
        if (!tournament) return res.status(404).json({ message: 'Not found' });
        
        res.json({ 
            tournamentTitle: tournament.tournamentTitle, 
            paragraph: tournament.paragraph 
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// 4. Update Tournament Info (Admin)
app.put('/api/tournament/:id', async (req, res) => {
    try {
        const { paragraph } = req.body;
        await Tournament.findOneAndUpdate(
            { tournamentId: req.params.id }, 
            { paragraph }
        );
        res.json({ message: 'Information saved successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Save or replace a numbered Cloudinary asset for a tournament.
app.put('/api/tournament/:id/media/:number', async (req, res) => {
    try {
        const number = Number(req.params.number);
        const { url, resourceType, originalName } = req.body;
        if (!Number.isInteger(number) || number < 1 || !url || !originalName) {
            return res.status(400).json({ message: 'A positive number, URL, and filename are required' });
        }
        const filenamePattern = new RegExp(`^${number}\\.(png|jpe?g|gif|webp|mp4|webm|mov|mp3|wav)$`, 'i');
        if (!filenamePattern.test(path.basename(originalName))) {
            return res.status(400).json({ message: `Filename must be ${number}.png, ${number}.mp3, or another supported media extension` });
        }
        if (!['image', 'video', 'raw'].includes(resourceType)) {
            return res.status(400).json({ message: 'Unsupported media type' });
        }
        const tournament = await Tournament.findOne({ tournamentId: req.params.id });
        if (!tournament) return res.status(404).json({ message: 'Tournament ID not found' });
        const media = await Media.findOneAndUpdate(
            { tournamentId: req.params.id, number },
            { url, resourceType, originalName },
            { upsert: true, new: true, runValidators: true }
        );
        res.json(media);
    } catch (err) {
        res.status(500).json({ message: 'Server error while saving media' });
    }
});

// Find a numbered asset in a tournament.
app.get('/api/tournament/:id/media/:number', async (req, res) => {
    try {
        const media = await Media.findOne({
            tournamentId: req.params.id,
            number: Number(req.params.number)
        }).lean();
        if (!media) return res.status(404).json({ message: 'No media found for that number' });
        res.json(media);
    } catch (err) {
        res.status(500).json({ message: 'Server error while loading media' });
    }
});

// Connect to MongoDB and Start Server
const PORT = process.env.PORT || 3000;
const MONGO_URI = "mongodb+srv://abrar102022916206_db_user:mpe6AcxuaP0oIr8r@cluster0.a4015aj.mongodb.net/?appName=Cluster0";

if (!MONGO_URI) {
    throw new Error('MONGO_URI is missing from .env');
}

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('Connected to MongoDB');
        app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch(err => console.error('MongoDB connection error:', err));