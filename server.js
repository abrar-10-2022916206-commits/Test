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

// Connect to MongoDB and Start Server
const PORT = process.env.PORT || 3000;
const MONGO_URI = "mongodb+srv://abrar102022916206_db_user:<mpe6AcxuaP0oIr8r>@cluster0.a4015aj.mongodb.net";

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('Connected to MongoDB');
        app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch(err => console.error('MongoDB connection error:', err));