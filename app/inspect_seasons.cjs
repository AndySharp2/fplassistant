const fs = require('fs');
const data = require('./next_data.json');
const pageData = data.props.pageProps.data;

const currentSeasonId = pageData.currentSeasonId;
const currentSeason = pageData.seasons.find(s => s.id === currentSeasonId);
console.log('Current Season Object:', currentSeason);
