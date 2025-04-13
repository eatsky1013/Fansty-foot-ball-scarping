const mongoose = require('mongoose');

const ESPNPlayerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    firstName: String,
    lastName: String,
    position: {
        type: String,
        required: true,
        enum: ['QB', 'RB', 'WR', 'TE', 'K', 'D/ST', 'Unknown']
    },
    team: {
        type: String,
        default: ''
    },
    jersey: String,
    id: String,
    injured: Boolean,
    injuryStatus: {
        type: String,
        default: 'ACTIVE'
    },
    lastNewsDate: Date,
    eligibleSlots: [Number],
    stats: {
        games_played: {
            type: Number,
            default: 0
        },
        passing: {
            attempts: {
                type: Number,
                default: 0
            },
            completions: {
                type: Number,
                default: 0
            },
            yards: {
                type: Number,
                default: 0
            },
            yards_per_game: { type: Number, default: 0 },
            touchdowns: {
                type: Number,
                default: 0
            },
            interceptions: {
                type: Number,
                default: 0
            }
        },
        rushing: {
            attempts: {
                type: Number,
                default: 0
            },
            yards: {
                type: Number,
                default: 0
            },
            touchdowns: {
                type: Number,
                default: 0
            }
        },
        receiving: {
            receptions: {
                type: Number,
                default: 0
            },
            yards: {
                type: Number,
                default: 0
            },
            touchdowns: {
                type: Number,
                default: 0
            }
        },
        misc: {
            two_point_conversions: {
                type: Number,
                default: 0
            },
            fumbles_lost: {
                type: Number,
                default: 0
            },
            total_touchdowns: {
                type: Number,
                default: 0
            }
        },
        fantasy: {
            total_points: {
                type: Number,
                default: 0
            },
            points_per_game: {
                type: Number,
                default: 0
            },
            rankings: {
                standard: {
                    rank: { type: Number, default: 0 },
                    auctionValue: { type: Number, default: 0 },
                    published: { type: Boolean, default: false }
                },
                ppr: {
                    rank: { type: Number, default: 0 },
                    auctionValue: { type: Number, default: 0 },
                    published: { type: Boolean, default: false }
                }
            }
        }
    },
    ratings: {
        positionalRanking: { type: Number, default: 0 },
        totalRanking: { type: Number, default: 0 },
        totalRating: { type: Number, default: 0 }
    },
    status: {
        type: String,
        default: 'WAIVERS'
    },
    waiverProcessDate: Date,
    rosterLocked: Boolean,
    tradeLocked: Boolean,
    source: {
        type: String,
        default: 'ESPN'
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Pre-save middleware to handle position validation
ESPNPlayerSchema.pre('save', function(next) {
    if (!this.position || this.position.trim() === '') {
        this.position = 'Unknown';
    }
    next();
});

module.exports = mongoose.model('ESPNPlayer', ESPNPlayerSchema); 