const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    position: {
        type: String,
        required: true
    },
    team: {
        type: String,
        required: true
    },
    stats: {
        games_played: Number,
        passing: {
            attempts: Number,
            completions: Number,
            yards: Number,
            yards_per_game: Number,
            touchdowns: Number,
            interceptions: Number,
            rating: Number
        },
        rushing: {
            attempts: Number,
            yards: Number,
            average: Number,
            touchdowns: Number
        },
        fantasy: {
            fumbles_lost: Number,
            total_points: Number,
            points_per_game: Number
        }
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Player', playerSchema); 