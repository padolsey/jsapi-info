
var http = require('http'),
	jssrc = require('./jsapi/jsapi'),
	port = process.argv[2];

port = port && /^\d+$/.test(port) ? port : 8001;

http.createServer(jssrc.server).listen(port);
console.log('Server running on ' + port + '. Try: http://127.0.0.1:' + port  + '/jquery/css');
