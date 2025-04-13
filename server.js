const express = require('express');
const connectDB = require('./connection');
const CBSPlayer = require('./models/CBSPlayer');
const ESPNPlayer = require('./models/ESPNPlayer');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Error logging function
function logError(location, error) {
    const timestamp = new Date().toISOString();
    const errorMessage = `[${timestamp}] Error in ${location}: ${error.message}`;
    const errorStack = error.stack ? `\nStack Trace:\n${error.stack}` : '';
    
    console.error('\x1b[31m%s\x1b[0m', errorMessage); // Red color for error message
    if (errorStack) {
        console.error('\x1b[33m%s\x1b[0m', errorStack); // Yellow color for stack trace
    }
    
    // Log additional details if available
    if (error.response) {
        console.error('\x1b[36m%s\x1b[0m', `Response Status: ${error.response.status}`);
        console.error('\x1b[36m%s\x1b[0m', `Response Headers:`, error.response.headers);
        console.error('\x1b[36m%s\x1b[0m', `Response Data:`, error.response.data);
    }
}

// Load ESPN API headers
let espnHeaders;
try {
    const headersPath = path.join(__dirname, 'headers.json');
    espnHeaders = JSON.parse(fs.readFileSync(headersPath, 'utf8'));
    console.log('\x1b[32m%s\x1b[0m', `[${new Date().toISOString()}] Successfully loaded ESPN headers`);
} catch (error) {
    logError('Loading ESPN Headers', error);
    espnHeaders = {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    };
    console.log('\x1b[33m%s\x1b[0m', `[${new Date().toISOString()}] Using fallback ESPN headers`);
}

// Connect to MongoDB with error handling
connectDB().catch(error => {
    logError('MongoDB Connection', error);
    process.exit(1);
});

// Middleware
app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({limit: '50mb', extended: true}));
app.set('view engine', 'ejs');

// Global error handler middleware
app.use((err, req, res, next) => {
    logError('Global Error Handler', err);
    res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Routes
// Home page - List all players
app.get('/', async (req, res) => {
    try {
        const cbsPlayers = await CBSPlayer.find().sort({ 'stats.fantasy.total_points': -1 });
        const espnPlayers = await ESPNPlayer.find().sort({ 'stats.fantasy.total_points': -1 });
        res.render('index', { cbsPlayers, espnPlayers });
    } catch (error) {
        logError('Home Route', error);
        res.status(500).send('Server Error');
    }
});

// Fetch players from database
app.get('/fetchFromDB', async (req, res) => {
    try {
        const players = await CBSPlayer.find().sort({ 'stats.fantasy.total_points': -1 });
        res.json({ success: true, players });
    } catch (error) {
        logError('Fetch from DB', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error fetching from database',
            details: error.message
        });
    }
});

// Get player details
app.get('/player/:source/:id', async (req, res) => {
    try {
        const { source, id } = req.params;
        let player;

        if (source.toLowerCase() === 'cbs') {
            player = await CBSPlayer.findById(id);
        } else if (source.toLowerCase() === 'espn') {
            player = await ESPNPlayer.findById(id);
        } else {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid source specified' 
            });
        }

        if (!player) {
            logError('Get Player Details', new Error(`Player not found with ID: ${id}`));
            return res.status(404).json({ 
                success: false, 
                error: 'Player not found' 
            });
        }

        res.json({ 
            success: true, 
            player,
            source: source.toLowerCase()
        });
    } catch (error) {
        logError('Get Player Details', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server Error',
            details: error.message
        });
    }
});

// Delete player
app.post('/player/delete/:source/:id', async (req, res) => {
    try {
        const { source, id } = req.params;
        let result;

        if (source.toLowerCase() === 'cbs') {
            result = await CBSPlayer.findByIdAndDelete(id);
        } else if (source.toLowerCase() === 'espn') {
            result = await ESPNPlayer.findByIdAndDelete(id);
        } else {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid source specified' 
            });
        }

        if (!result) {
            logError('Delete Player', new Error(`Player not found with ID: ${id}`));
            return res.status(404).json({ 
                success: false, 
                error: 'Player not found' 
            });
        }

        res.json({ 
            success: true, 
            message: 'Player deleted successfully',
            source: source.toLowerCase()
        });
    } catch (error) {
        logError('Delete Player', error);
        res.status(500).json({ 
            success: false, 
            error: 'Server Error',
            details: error.message
        });
    }
});

// Erase all data for a specific source
app.post('/eraseAll/:source', async (req, res) => {
    try {
        const { source } = req.params;
        let result;
        
        if (source.toLowerCase() === 'cbs') {
            result = await CBSPlayer.deleteMany({});
        } else if (source.toLowerCase() === 'espn') {
            result = await ESPNPlayer.deleteMany({});
        } else {
            throw new Error('Invalid source specified');
        }
        
        console.log('\x1b[32m%s\x1b[0m', `[${new Date().toISOString()}] Successfully erased ${result.deletedCount} ${source.toUpperCase()} players`);
        res.json({ success: true, deletedCount: result.deletedCount });
    } catch (error) {
        logError('Erase All Data', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error erasing data',
            details: error.message
        });
    }
});

// Scrape CBS data route
app.get('/scrape/cbs', async (req, res) => {
    try {
        const URL = 'https://www.cbssports.com/fantasy/football/stats/QB/2024/ytd/stats/nonppr/';
        const response = await axios.get(URL);
        const html = response.data;
        const $ = cheerio.load(html);

        const players = [];

        $('.TableBase-bodyTr').each((index, element) => {
            // Extract player name and team
            const nameElement = $(element).find('.CellPlayerName--long a');
            const name = nameElement.text().trim();
            
            const teamElement = $(element).find('.CellPlayerName--long .CellPlayerName-team').first();
            const team = teamElement.text().trim();

            // Skip if required fields are missing
            if (!name || !team) {
                console.warn(`Skipping player due to missing data: name=${name}, team=${team}`);
                return;
            }

            const player = {
                name: name,
                position: 'QB', // Since we're scraping QB stats
                team: team,
                stats: {
                    games_played: 0,
                    passing: {
                        attempts: 0,
                        completions: 0,
                        yards: 0,
                        yards_per_game: 0,
                        touchdowns: 0,
                        interceptions: 0,
                        rating: 0
                    },
                    rushing: {
                        attempts: 0,
                        yards: 0,
                        average: 0,
                        touchdowns: 0
                    },
                    fantasy: {
                        fumbles_lost: 0,
                        total_points: 0,
                        points_per_game: 0
                    }
                }
            };

            // Extract stats
            const stats = $(element).find('.TableBase-bodyTd--number');
            
            // Games played
            player.stats.games_played = parseInt($(stats[0]).text().trim()) || 0;

            // Passing stats
            player.stats.passing.attempts = parseInt($(stats[1]).text().trim()) || 0;
            player.stats.passing.completions = parseInt($(stats[2]).text().trim()) || 0;
            player.stats.passing.yards = parseInt($(stats[3]).text().trim()) || 0;
            player.stats.passing.yards_per_game = parseFloat($(stats[4]).text().trim()) || 0;
            player.stats.passing.touchdowns = parseInt($(stats[5]).text().trim()) || 0;
            player.stats.passing.interceptions = parseInt($(stats[6]).text().trim()) || 0;
            player.stats.passing.rating = parseFloat($(stats[7]).text().trim()) || 0;

            // Rushing stats
            player.stats.rushing.attempts = parseInt($(stats[8]).text().trim()) || 0;
            player.stats.rushing.yards = parseInt($(stats[9]).text().trim()) || 0;
            player.stats.rushing.average = parseFloat($(stats[10]).text().trim()) || 0;
            player.stats.rushing.touchdowns = parseInt($(stats[11]).text().trim()) || 0;

            // Fantasy stats
            player.stats.fantasy.fumbles_lost = parseInt($(stats[12]).text().trim()) || 0;
            player.stats.fantasy.total_points = parseFloat($(stats[13]).text().trim()) || 0;
            player.stats.fantasy.points_per_game = parseFloat($(stats[14]).text().trim()) || 0;

            players.push(player);
        });

        res.json({ success: true, players, source: 'CBS' });
    } catch (error) {
        console.error('Error scraping CBS data:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error scraping CBS data',
            details: error.message
        });
    }
});

// Scrape ESPN data route
app.get('/scrape/espn', async (req, res) => {
    try {
        const playerLimit = parseInt(req.query.limit) || 10000; // Default to 100 if not specified
        console.log('\x1b[34m%s\x1b[0m', `[${new Date().toISOString()}] Starting ESPN data scrape with limit: ${playerLimit}...`);
        
        // Deep clone the headers to avoid modifying the original
        const customHeaders = JSON.parse(JSON.stringify(espnHeaders));
        
        // Create the fantasy filter with the limit
        const fantasyFilter = {
            players: {
                filterSlotIds: {
                    value: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 23, 24]
                },
                limit: playerLimit,
                offset: 0,
                sortDraftRanks: {
                    sortPriority: 2,
                    sortAsc: true,
                    value: "STANDARD"
                },
                filterRanksForScoringPeriodIds: {
                    value: [2024]
                },
                filterStatsForTopScoringPeriodIds: {
                    value: 2,
                    additionalValue: ["002024", "102024", "002023", "022024"]
                }
            }
        };

        // Set the updated filter
        customHeaders['X-Fantasy-Filter'] = JSON.stringify(fantasyFilter);

        const URL = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2024/segments/0/leaguedefaults/1?scoringPeriodId=0&view=kona_player_info';
        
        const response = await axios.get(URL, {
            headers: customHeaders,
            timeout: 10000,
            validateStatus: function (status) {
                return status >= 200 && status < 300;
            }
        });

        if (!response.data) {
            throw new Error('Empty response from ESPN API');
        }

        const data = response.data;
        
        if (!data.players || !Array.isArray(data.players)) {
            throw new Error('Invalid player data format in ESPN response');
        }

        // Limit the players array to the requested size
        const limitedPlayers = data.players.slice(0, playerLimit);

        console.log('\x1b[32m%s\x1b[0m', `[${new Date().toISOString()}] Successfully fetched ${limitedPlayers.length} players from ESPN (limit: ${playerLimit})`);

        const players = limitedPlayers.map(player => {
            if (!player.player) {
                console.warn('Skipping player with missing data');
                return null;
            }

            const formattedPlayer = {
                name: player.player.fullName || `${player.player.firstName || ''} ${player.player.lastName || ''}`.trim(),
                firstName: player.player.firstName || '',
                lastName: player.player.lastName || '',
                position: getPositionFromSlots(player.player.eligibleSlots),
                team: getTeamName(player.player.proTeamId),
                displayName: `${player.player.fullName} ${getTeamName(player.player.proTeamId)} ${getPositionFromSlots(player.player.eligibleSlots)}`,
                status: player.player.status || 'ACTIVE',
                injuryStatus: player.player.injuryStatus || '',
                stats: {
                    games_played: 0,
                    passing: {
                        attempts: 0,
                        completions: 0,
                        yards: 0,
                        touchdowns: 0,
                        interceptions: 0
                    },
                    rushing: {
                        attempts: 0,
                        yards: 0,
                        touchdowns: 0
                    },
                    receiving: {
                        receptions: 0,
                        yards: 0,
                        touchdowns: 0
                    },
                    misc: {
                        two_point_conversions: 0,
                        fumbles_lost: 0,
                        total_touchdowns: 0
                    },
                    fantasy: {
                        total_points: 0,
                        points_per_game: 0
                    }
                }
            };

            // Extract stats from the player's stats array
            if (player.player.stats && Array.isArray(player.player.stats)) {
                const seasonStats = player.player.stats.find(stat => 
                    stat.seasonId === 2024 && stat.statSplitTypeId === 0
                );

                if (seasonStats && seasonStats.stats) {
                    const stats = seasonStats.stats;
                    
                    // Passing stats - ESPN uses these specific stat IDs
                    formattedPlayer.stats.passing.attempts = parseInt(stats["2"] || 0);  // Pass attempts
                    formattedPlayer.stats.passing.completions = parseInt(stats["1"] || 0);  // Pass completions
                    formattedPlayer.stats.passing.yards = parseInt(stats["3"] || 0);  // Pass yards
                    formattedPlayer.stats.passing.touchdowns = parseInt(stats["4"] || 0);  // Pass TDs
                    formattedPlayer.stats.passing.interceptions = parseInt(stats["20"] || 0);  // Interceptions
                    
                    // Rushing stats
                    formattedPlayer.stats.rushing.attempts = parseInt(stats["23"] || 0);  // Rush attempts
                    formattedPlayer.stats.rushing.yards = parseInt(stats["24"] || 0);  // Rush yards
                    formattedPlayer.stats.rushing.touchdowns = parseInt(stats["25"] || 0);  // Rush TDs
                    
                    // Receiving stats
                    formattedPlayer.stats.receiving.receptions = parseInt(stats["53"] || 0);  // Receptions
                    formattedPlayer.stats.receiving.yards = parseInt(stats["42"] || 0);  // Receiving yards
                    formattedPlayer.stats.receiving.touchdowns = parseInt(stats["43"] || 0);  // Receiving TDs
                    
                    // Misc stats
                    formattedPlayer.stats.misc.two_point_conversions = parseInt(stats["62"] || 0);  // 2PT conversions
                    formattedPlayer.stats.misc.fumbles_lost = parseInt(stats["72"] || 0);  // Fumbles lost
                    
                    // Calculate total touchdowns (Pass + Rush + Receive)
                    formattedPlayer.stats.misc.total_touchdowns = 
                        (parseInt(stats["4"] || 0) +  // Pass TDs
                         parseInt(stats["25"] || 0) +  // Rush TDs
                         parseInt(stats["43"] || 0));  // Receive TDs
                    
                    // Fantasy points and games played
                    formattedPlayer.stats.games_played = parseInt(stats["0"] || 0);  // Games played
                    formattedPlayer.stats.fantasy.total_points = parseFloat(seasonStats.appliedTotal || 0);
                    
                    if (formattedPlayer.stats.games_played > 0) {
                        formattedPlayer.stats.fantasy.points_per_game = 
                            (formattedPlayer.stats.fantasy.total_points / formattedPlayer.stats.games_played);
                    }

                    // Format the numbers
                    formattedPlayer.stats.fantasy.total_points = Number(formattedPlayer.stats.fantasy.total_points).toFixed(1);
                    formattedPlayer.stats.fantasy.points_per_game = Number(formattedPlayer.stats.fantasy.points_per_game).toFixed(1);
                }
            }

            return formattedPlayer;
        }).filter(player => player !== null); // Remove any null players

        // Sort players by fantasy points
        players.sort((a, b) => b.stats.fantasy.total_points - a.stats.fantasy.total_points);

        res.json({ 
            success: true, 
            players, 
            source: 'ESPN',
            limit: playerLimit,
            actualCount: players.length
        });
    } catch (error) {
        logError('ESPN Scraping', error);
        
        if (error.code === 'ECONNRESET') {
            res.status(503).json({ 
                success: false, 
                error: 'Connection to ESPN API failed. Please try again later.',
                details: error.message
            });
        } else if (error.response) {
            res.status(error.response.status).json({ 
                success: false, 
                error: `ESPN API error: ${error.response.statusText}`,
                details: error.response.data
            });
        } else {
            res.status(500).json({ 
                success: false, 
                error: 'Error scraping ESPN data',
                details: error.message
            });
        }
    }
});

// Helper function to get position from eligible slots
function getPositionFromSlots(slots) {
    if (!slots || !slots.length) return 'Unknown';
    
    // ESPN position codes
    const positionMap = {
        1: 'QB',
        2: 'RB',
        3: 'WR',
        4: 'TE',
        5: 'K',
        16: 'D/ST'
    };
    
    // Find the first valid position
    for (const slot of slots) {
        if (positionMap[slot]) {
            return positionMap[slot];
        }
    }
    
    return 'Unknown';
}

// Helper function to get team name from team ID
function getTeamName(teamId) {
    const teamMap = {
        1: 'ATL', 2: 'BUF', 3: 'CHI', 4: 'CIN', 5: 'CLE', 6: 'DAL', 7: 'DEN', 8: 'DET',
        9: 'GB', 10: 'TEN', 11: 'IND', 12: 'KC', 13: 'LV', 14: 'LAR', 15: 'MIA', 16: 'MIN',
        17: 'NE', 18: 'NO', 19: 'NYG', 20: 'NYJ', 21: 'PHI', 22: 'ARI', 23: 'PIT', 24: 'LAC',
        25: 'SF', 26: 'SEA', 27: 'TB', 28: 'WSH', 29: 'CAR', 30: 'JAX', 33: 'BAL', 34: 'HOU'
    };
    
    return teamMap[teamId] || `Team ${teamId}`;
}

// Save CBS data route
app.post('/save/cbs', async (req, res) => {
    try {
        const { players } = req.body;
        
        if (!Array.isArray(players)) {
            throw new Error('Invalid player data format');
        }

        // Validate and format player data
        const formattedPlayers = players.map(player => {
            // Ensure required fields are present
            if (!player.name || !player.position || !player.team) {
                throw new Error(`Missing required fields for player: ${JSON.stringify(player)}`);
            }

            return {
                name: player.name.trim(),
                position: player.position.trim().toUpperCase(),
                team: player.team.trim(),
                stats: {
                    games_played: player.stats?.games_played || 0,
                    passing: {
                        attempts: player.stats?.passing?.attempts || 0,
                        completions: player.stats?.passing?.completions || 0,
                        yards: player.stats?.passing?.yards || 0,
                        yards_per_game: player.stats?.passing?.yards_per_game || 0,
                        touchdowns: player.stats?.passing?.touchdowns || 0,
                        interceptions: player.stats?.passing?.interceptions || 0,
                        rating: player.stats?.passing?.rating || 0
                    },
                    rushing: {
                        attempts: player.stats?.rushing?.attempts || 0,
                        yards: player.stats?.rushing?.yards || 0,
                        average: player.stats?.rushing?.average || 0,
                        touchdowns: player.stats?.rushing?.touchdowns || 0
                    },
                    fantasy: {
                        fumbles_lost: player.stats?.fantasy?.fumbles_lost || 0,
                        total_points: player.stats?.fantasy?.total_points || 0,
                        points_per_game: player.stats?.fantasy?.points_per_game || 0
                    }
                }
            };
        });
        
        // Clear existing CBS data
        await CBSPlayer.deleteMany({});
        
        // Save new CBS data
        const savedPlayers = await CBSPlayer.insertMany(formattedPlayers);
        
        res.json({ 
            success: true,
            savedCount: savedPlayers.length
        });
    } catch (error) {
        console.error('Error saving CBS data:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error saving CBS data',
            details: error.message
        });
    }
});

// Save ESPN data route
app.post('/save/espn', async (req, res) => {
    try {
        const { players } = req.body;
        
        if (!Array.isArray(players)) {
            throw new Error('Invalid player data format');
        }

        // Validate and format player data
        const formattedPlayers = players.map(player => {
            // Ensure required fields are present
            if (!player.name || !player.position || !player.team) {
                throw new Error(`Missing required fields for player: ${JSON.stringify(player)}`);
            }

            // Fix position value to match enum values in schema
            let position = player.position.trim().toUpperCase();
            if (position === 'UNKNOWN') {
                position = 'Unknown';
            }

            return {
                name: player.name.trim(),
                position: position,
                team: player.team.trim(),
                stats: {
                    games_played: player.stats?.games_played || 0,
                    passing: {
                        attempts: player.stats?.passing?.attempts || 0,
                        completions: player.stats?.passing?.completions || 0,
                        yards: player.stats?.passing?.yards || 0,
                        touchdowns: player.stats?.passing?.touchdowns || 0,
                        interceptions: player.stats?.passing?.interceptions || 0
                    },
                    rushing: {
                        attempts: player.stats?.rushing?.attempts || 0,
                        yards: player.stats?.rushing?.yards || 0,
                        touchdowns: player.stats?.rushing?.touchdowns || 0
                    },
                    receiving: {
                        receptions: player.stats?.receiving?.receptions || 0,
                        yards: player.stats?.receiving?.yards || 0,
                        touchdowns: player.stats?.receiving?.touchdowns || 0
                    },
                    misc: {
                        two_point_conversions: player.stats?.misc?.two_point_conversions || 0,
                        fumbles_lost: player.stats?.misc?.fumbles_lost || 0,
                        total_touchdowns: player.stats?.misc?.total_touchdowns || 0
                    },
                    fantasy: {
                        total_points: player.stats?.fantasy?.total_points || 0,
                        points_per_game: player.stats?.fantasy?.points_per_game || 0
                    }
                }
            };
        });
        
        // Clear existing ESPN data
        await ESPNPlayer.deleteMany({});
        
        // Save new ESPN data
        const savedPlayers = await ESPNPlayer.insertMany(formattedPlayers);
        
        res.json({ 
            success: true,
            savedCount: savedPlayers.length,
            players: savedPlayers
        });
    } catch (error) {
        logError('Save ESPN Data', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error saving ESPN data',
            details: error.message
        });
    }
});

// Get ESPN player details
app.get('/espn/player/:id', async (req, res) => {
    try {
        const player = await ESPNPlayer.findById(req.params.id);
        if (!player) {
            logError('Get ESPN Player Details', new Error(`Player not found with ID: ${req.params.id}`));
            return res.status(404).send('Player not found');
        }
        res.render('player', { player, source: 'ESPN' });
    } catch (error) {
        logError('Get ESPN Player Details', error);
        res.status(500).send('Server Error');
    }
});

// Delete ESPN player
app.post('/espn/player/delete/:id', async (req, res) => {
    try {
        const result = await ESPNPlayer.findByIdAndDelete(req.params.id);
        if (!result) {
            logError('Delete ESPN Player', new Error(`Player not found with ID: ${req.params.id}`));
            return res.status(404).json({ success: false, error: 'Player not found' });
        }
        res.json({ success: true });
    } catch (error) {
        logError('Delete ESPN Player', error);
        res.status(500).json({ success: false, error: 'Server Error' });
    }
});

// Get all CBS players
app.get('/players/cbs', async (req, res) => {
    try {
        const players = await CBSPlayer.find().sort({ 'stats.fantasy.total_points': -1 });
        res.json({ success: true, players });
    } catch (error) {
        logError('Get CBS Players', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error fetching CBS players',
            details: error.message
        });
    }
});

// Get all ESPN players
app.get('/players/espn', async (req, res) => {
    try {
        const players = await ESPNPlayer.find().sort({ 'stats.fantasy.total_points': -1 });
        res.json({ success: true, players });
    } catch (error) {
        logError('Get ESPN Players', error);
        res.status(500).json({ 
            success: false, 
            error: 'Error fetching ESPN players',
            details: error.message
        });
    }
});

// Error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
    logError('Uncaught Exception', error);
    process.exit(1);
});

// Error handling for unhandled promise rejections
process.on('unhandledRejection', (error) => {
    logError('Unhandled Promise Rejection', error);
    process.exit(1);
});

// Start server with error handling
app.listen(PORT, () => {
    console.log('\x1b[32m%s\x1b[0m', `[${new Date().toISOString()}] Server is running on http://localhost:${PORT}`);
}).on('error', (error) => {
    logError('Server Startup', error);
    process.exit(1);
}); 