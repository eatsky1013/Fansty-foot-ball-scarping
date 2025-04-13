const mongoose = require('mongoose');

const CBSPlayerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    position: {
        type: String,
        required: true,
        enum: ['QB', 'RB', 'WR', 'TE', 'K', 'D/ST']
    },
    team: {
        type: String,
        required: true
    },
    stats: {
        games_played: { type: Number, default: 0 },
        passing: {
            attempts: { type: Number, default: 0 },
            completions: { type: Number, default: 0 },
            yards: { type: Number, default: 0 },
            yards_per_game: { type: Number, default: 0 },
            touchdowns: { type: Number, default: 0 },
            interceptions: { type: Number, default: 0 },
            rating: { type: Number, default: 0 }
        },
        rushing: {
            attempts: { type: Number, default: 0 },
            yards: { type: Number, default: 0 },
            average: { type: Number, default: 0 },
            touchdowns: { type: Number, default: 0 }
        },
        fantasy: {
            fumbles_lost: { type: Number, default: 0 },
            total_points: { type: Number, default: 0 },
            points_per_game: { type: Number, default: 0 }
        }
    },
    source: {
        type: String,
        default: 'CBS'
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('CBSPlayer', CBSPlayerSchema); 