const http = require('http');

http.get('http://127.0.0.1:4040/api/tunnels', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (json.tunnels && json.tunnels.length > 0) {
        console.log(json.tunnels[0].public_url);
      } else {
        console.log('OFFLINE');
      }
    } catch (e) {
      console.log('OFFLINE');
    }
  });
}).on('error', () => {
  console.log('OFFLINE');
});
