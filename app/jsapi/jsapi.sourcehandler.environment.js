var events = require('events'),
	jsdom = require('jsdom'),
	log = require('./jsapi.log.js');

/**
 * SourceHandler.Environment
 * An environment for located source in
 * utlising jsdom
 **/
module.exports = Environment = function SHEnvironment(js) {

	events.EventEmitter.call(this);

	this.js = js;

};

Environment.jsdomFixes = [
	'navigator = window.navigator || {}',
	'navigator.language = "en-GB"'
].join(';');

Environment.prototype = new events.EventEmitter;

Environment.prototype.init = function() {

	var tryStart = 'window.__errors__ = []; try {',
		tryEnd = '} catch(e) { window.__errors__.push(e); }',
		doneRun = false;

	this.env = jsdom.env({
		html: '<div></div>',
		src: [
			Environment.jsdomFixes,
			tryStart + this.js + tryEnd
		],
		done: function(errors, window) {

			// Sometimes (?) it runs more than once.

			if (doneRun) {
				return;
			}

			doneRun = true;

			if (errors) {
				this.emit('error', errors);
				return;
			}

			this.window = window;
			this.emit('ready');

		}.bind(this)
	});

};