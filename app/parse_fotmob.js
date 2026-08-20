const fs = require('fs');
const html = fs.readFileSync('temp_fotmob.html', 'utf8');

// Find __NEXT_DATA__
const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
if (nextDataMatch) {
    console.log('Found __NEXT_DATA__!');
    const data = JSON.parse(nextDataMatch[1]);
    fs.writeFileSync('next_data.json', JSON.stringify(data, null, 2));
    console.log('Keys in data:', Object.keys(data));
    if (data.props) console.log('Keys in props:', Object.keys(data.props));
    if (data.props && data.props.pageProps) {
        console.log('Keys in pageProps:', Object.keys(data.props.pageProps));
    }
} else {
    console.log('__NEXT_DATA__ not found');
}
