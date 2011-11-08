
var http = require('http'),
	jssrc = require('./jsapi/jsapi');

http.createServer(jssrc.server).listen(3030);