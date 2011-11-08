var events = require('events'),
	fs = require('fs'),
	url = require('url'),
	http = require('http'),
	log = require('./jsapi.log.js');

/**
 * SourceHandler.Loader
 * Takes care of loading source files
 */
module.exports = Loader = function SHLoader(requestData, libraryData) {

	events.EventEmitter.call(this);

	this.requestData = requestData;
	this.libraryData = libraryData;

	this.filename = './_libs/' + requestData.lib + '.' + requestData.ver + '.js';

};

Loader.prototype = new events.EventEmitter;

Loader.prototype.get = function() {

	fs.stat(this.filename, function(err, stats) {

		if (this.requestData.refresh || err && err.code === 'ENOENT') {
			this.getRemoteSource();
		} else if(err) {
			this.emit('failure', {error: 'Error on file retrieval, ' + err.code});
		} else {
			this.getLocalSource();
		}

	}.bind(this));

};

Loader.prototype.getRemoteSource = function() {

	var me = this,
		libURL = url.parse(
			this.libraryData.url.replace('{VERSION}', this.requestData.ver)
		),
		filestream = fs.createWriteStream(this.filename, {
			encoding: 'utf8'
		});

	log('Getting:', libURL);

	var request = http.get(
		{
			host: libURL.host,
			port: libURL.port,
			path: libURL.pathname + (libURL.search || '')
		},
		function(res) {

			var source = '';
			res.setEncoding('utf8');

			res.on('data', function (chunk) {
				source += chunk;
				filestream.write(chunk);
			});

			res.on('end', function() {
				log('Completed writing ' + me.filename);
				me.source = source;
				me.emit('success', source);
			});

		}
	);

	request.on('error', function(e){
		log("Got req error: " + e.message);
		me.emit('failure', {error: e});
	});

};

Loader.prototype.getLocalSource = function() {

	fs.readFile(this.filename, 'utf8', function(err, data){

		if (err) {

			log('Error on reading from local source ('+me.filename+')', err);
			this.emit('failure', {error: err});

		} else {

			log('Got local source', this.filename);
			this.source = data;
			this.emit('success', data);

		}

	}.bind(this));

};