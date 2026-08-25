const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
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
    roomId: { type: String, required: true },
    mediaNumber: { type: Number, required: true },
    publicId: { type: String, required: true },
    resourceType: { type: String, enum: ['image', 'video'], required: true },
    format: { type: String, required: true },
    originalName: { type: String, required: true },
    url: { type: String, required: true }
}, { timestamps: true });

mediaSchema.index({ roomId: 1, mediaNumber: 1 }, { unique: true });
const Media = mongoose.model('Media', mediaSchema);
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        const isImage = /^(image)\//.test(file.mimetype) || /\.(jpg|jpeg|png|gif|webp|bmp|tiff)$/i.test(file.originalname);
        const isVideo = /^(video)\//.test(file.mimetype) || /\.(mp4|webm|mov|avi|mkv)$/i.test(file.originalname);
        callback(isImage || isVideo ? null : new Error('Only image and video files are allowed'));
    }
});

const cloudinaryConfig = {
    cloud_name: "ny0x5qas",
    api_key: "468813474452611",
    api_secret: "B0gy5U-vshg_fptQp_PV81Di4tU"
};
cloudinary.config(cloudinaryConfig);

function uploadToCloudinary(file, folder, mediaNumber, resourceType) {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
            folder,
            public_id: String(mediaNumber),
            resource_type: resourceType,
            overwrite: true,
            invalidate: true
        }, (error, result) => error ? reject(error) : resolve(result));
        stream.end(file.buffer);
    });
}

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

// 5. Upload or replace numbered room media
app.post('/api/media/:roomId', upload.single('media'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'Choose an image or video file' });

        const match = req.file.originalname.match(/^(\d+)\.[^.]+$/i);
        if (!match) {
            return res.status(400).json({ message: 'Filename must be a number, for example 12.png or 12.mp4' });
        }

        const mediaNumber = Number(match[1]);
        const resourceType = req.file.mimetype.startsWith('video/') || /\.(mp4|webm|mov|avi|mkv)$/i.test(req.file.originalname)
            ? 'video'
            : 'image';
        const folder = `npl-season-05/${req.params.roomId}`;
        const result = await uploadToCloudinary(req.file, folder, mediaNumber, resourceType);
        const media = await Media.findOneAndUpdate(
            { roomId: req.params.roomId, mediaNumber },
            {
                roomId: req.params.roomId,
                mediaNumber,
                publicId: result.public_id,
                resourceType,
                format: result.format,
                originalName: req.file.originalname,
                url: result.secure_url
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        res.status(201).json({ media });
    } catch (err) {
        console.error('Media upload error:', err.message);
        res.status(500).json({ message: err.message || 'Media upload failed' });
    }
});

// 6. Get one numbered image or video for a room
app.get('/api/media/:roomId/:mediaNumber', async (req, res) => {
    try {
        const mediaNumber = Number(req.params.mediaNumber);
        if (!Number.isInteger(mediaNumber) || mediaNumber < 0) {
            return res.status(400).json({ message: 'Media number must be a non-negative integer' });
        }

        const media = await Media.findOne({ roomId: req.params.roomId, mediaNumber }).lean();
        if (!media) return res.status(404).json({ message: 'No media found for that number in this room' });
        res.json({ media });
    } catch (err) {
        res.status(500).json({ message: 'Media lookup failed' });
    }
});

app.get('/api/media/:roomId', async (req, res) => {
    try {
        const media = await Media.find({ roomId: req.params.roomId }).sort({ mediaNumber: 1 }).lean();
        res.json({ media });
    } catch (err) {
        res.status(500).json({ message: 'Media list failed' });
    }
});

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError || err.message === 'Only image and video files are allowed') {
        return res.status(400).json({ message: err.message });
    }
    next(err);
});

// Connect to MongoDB and Start Server
const PORT = process.env.PORT || 3000;
const MONGO_URI = "mongodb+srv://abrar102022916206_db_user:mpe6AcxuaP0oIr8r@cluster0.a4015aj.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('Connected to MongoDB');
        app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch(err => console.error('MongoDB connection error:', err));