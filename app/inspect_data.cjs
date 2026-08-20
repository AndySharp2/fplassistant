const fs = require('fs');
const data = require('./next_data.json');
console.log('Keys in pageProps.data:', Object.keys(data.props.pageProps.data || {}));
if (data.props.pageProps.data) {
    const pageData = data.props.pageProps.data;
    console.log('All top keys in pageProps.data:', Object.keys(pageData));
    if (pageData.stats) {
        console.log('Keys in stats:', Object.keys(pageData.stats));
        if (Array.isArray(pageData.stats)) {
            console.log('stats is an array of length:', pageData.stats.length);
            if (pageData.stats.length > 0) {
                console.log('First element in stats:', JSON.stringify(pageData.stats[0], null, 2));
            }
        } else {
            console.log('stats is an object with keys:', Object.keys(pageData.stats));
            const firstKey = Object.keys(pageData.stats)[0];
            console.log('First stat category details:', JSON.stringify(pageData.stats[firstKey], null, 2).slice(0, 500));
        }
    }
    if (pageData.seasons) {
         console.log('Seasons array length:', pageData.seasons.length);
         console.log('Example season:', pageData.seasons[0]);
    }
}
