const fs = require('fs');
const data = require('./next_data.json');
const pageData = data.props.pageProps.data;

console.log('Seasons list:');
for (const s of pageData.seasons) {
    console.log(s);
}
