const fs = require('fs');
const data = require('./next_data.json');
const pageData = data.props.pageProps.data;

if (pageData.statsData) {
    const arr = Object.values(pageData.statsData);
    console.log('statsData array/object entries length:', arr.length);
    console.log('First entry in statsData:', JSON.stringify(arr[0], null, 2));
}
