var events = require('events'),
	jsdom = require('jsdom'),
	fs = require('fs'),
	log = require('./jsapi.log.js'),

	jquery = fs.readFileSync('./jsapi/jquery/jquery.1.6.4.js', 'utf8'),
	jqMacroSelector  = fs.readFileSync('./jsapi/jquery/jquery.macroselector.js', 'utf8');

module.exports = Docs = function() {
	events.EventEmitter.call(this);
};

Docs.prototype = new events.EventEmitter;

Docs.prototype.get = function(methodName, docsData) {

	this.docsData = docsData;

	var match;
	
	for (var i in docsData) {
		if (match = RegExp(i).test(methodName)) {
			log('Docs: Found matching documentation handler: ', methodName, i);
			this.load( methodName.replace(RegExp(i), docsData[i]) );
			break;
		}
	}

	if (!match) {
		log('No documentation found', methodName);
		this.emit('success', 'No documentation found', null);
	}

};

Docs.prototype.load = function(_url) {

	_url = _url.split(' ');

	var me = this,
		url = _url.shift(),
		selector = _url.join(' '),
		// Break up macro selector (jQ methods: `$:...`)
		macroSelector = selector.match(/\$:\w+|.+?(?=\$:|$)/g),
		run = false;

	log('Getting documentation from', url);
	log('With selector', selector);

	//yql.exec

	jsdom.env({
		html: url.replace(/#.+$/, ''), // remove hash
		src: [
			jquery,
			jqMacroSelector
		],
		done: function(err, window) {

			if (run) return;
			run = true;

			var $ = window.$,
				elements = $.macroSelector(selector);

			log('Docs: elements found', elements.length);

			if (elements[0]) {
				me.emit(
					'success',
					$('<div/>').append(elements).text() + ' <a href="' + url + '">Read full documentation &raquo;</a>',
					url
				);
			} else {
				me.emit('success', 'No documentation found', null);
			}

		}
	});

};
