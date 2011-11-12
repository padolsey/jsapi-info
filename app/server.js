
var http = require('http'),
	jssrc = require('./jsapi/jsapi');

http.createServer(jssrc.server).listen(8001);
console.log('Server running on 8001. Try: http://127.0.0.1:8001/jquery/css');