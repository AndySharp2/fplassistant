const fs = require('fs');
const data = require('./next_data.json');
const pageData = data.props.pageProps.data;

console.log('--- Current Season ID ---');
console.log(pageData.currentSeasonId);

console.log('--- currentStatName ---');
console.log(pageData.currentStatName);

console.log('--- substatTitle ---');
console.log(pageData.substatTitle);

console.log('--- statsData (slice of stringified or structure keys) ---');
if (pageData.statsData) {
    console.log('statsData keys:', Object.keys(pageData.statsData));
    if (pageData.statsData.players) {
        console.log('Players category count:', pageData.statsData.players.length);
        console.log('First 2 players:', JSON.stringify(pageData.statsData.players.slice(0, 2), null, 2));
    }
}
