
var http = require('http'),
	jssrc = require('./jsapi');

http.createServer(jssrc.server).listen(8001);