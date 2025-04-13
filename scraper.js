const axios = require('axios');
const cheerio = require('cheerio');
const connectDB = require('./db/connection');
const Player = require('./db/models/Player');
const mongoose = require('mongoose');

const URL = 'https://www.cbssports.com/fantasy/football/stats/QB/2024/ytd/stats/ppr/';

async function scrapePlayerData() {
    try {
        // Connect to MongoDB
        await connectDB();

        // Fetch the HTML content
        const response = await axios.get(URL);
        const html = response.data;
        const $ = cheerio.load(html);

        const players = [];

        // Find all player rows in the table
        $('.TableBase-bodyTr').each((index, element) => {
            const player = {
                name: '',
                position: 'QB',
                team: '',
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

            // Extract player name and team
            const nameElement = $(element).find('.CellPlayerName--long a');
            player.name = nameElement.text().trim();
            
            // Only select the team from the long version of the player name
            const teamElement = $(element).find('.CellPlayerName--long .CellPlayerName-team').first();
            player.team = teamElement.text().trim();

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

        // Clear existing data
        await Player.deleteMany({});

        // Save to MongoDB
        await Player.insertMany(players);
        console.log('Data has been successfully scraped and saved to MongoDB');

        // Disconnect from MongoDB
        await mongoose.disconnect();

    } catch (error) {
        console.error('Error:', error);
        // Ensure MongoDB connection is closed even if there's an error
        try {
            await mongoose.disconnect();
        } catch (disconnectError) {
            console.error('Error disconnecting from MongoDB:', disconnectError);
        }
    }
}

// Run the scraper
scrapePlayerData(); 