var events = require('events'),
	fs = require('fs'),
	http = require('http'),
	url = require('url'),
	jsdom = require('jsdom'),
	log = require('./jsapi.log.js');

module.exports = SourceHandler;

SourceHandler.Environment = require('./jsapi.sourcehandler.environment.js');
SourceHandler.Loader = require('./jsapi.sourcehandler.loader.js');
SourceHandler.Resolver = require('./jsapi.sourcehandler.resolver.js');

// SourceHandler takes a lib/ver/meth and fires a success event (with data)
// when it finds the source of the function (incl. line number). It fires
// 'failure' when it can't find it or another error occurs.

function SourceHandler(requestData, libData) {

	events.EventEmitter.call( this );

	var me = this;

	this.expandSourceN = requestData.expand;
	this.lib = requestData.lib;
	this.ver = requestData.ver;
	this.meth = requestData.meth;

	// The `nullify` array will contain items that need to be nullified
	// in order to correctly retrieve the lib's methods.
	// E.g. MooTools/Underscore implement Func-bind,
	// we need to nullify Function.prototype.bind so the SourceHandler
	// finds the libs' implementation instead of native.
	// (all occurs within jsdom context of course)
	this.nullify = libData.nullify && libData.nullify[0] ?
		libData.nullify.join('=null;') + '=null;' : '';

	this.libData = libData;

	this.loader = new SourceHandler.Loader(
		requestData.lib + '.' + requestData.ver,
		libData.url.replace('{VERSION}', requestData.ver),
		requestData.refresh
	);

	this.requires = libData.requires && libData.requires[requestData.ver];

	if (this.requires) {

		// In the case that this lib requires another file we want
		// to request the required file and then we can continue with
		// `setupEnvironment` ...

		this.loader
			.on('success', function(source) {

				log('Loaded lib URL: now loading requirement: ', this.requires);

				// Load required script:
				this.requiredLoader = new SourceHandler.Loader(
					this.requires.match(/\/([^\/]+)\.js$/)[1],
					this.requires,
					requestData.refresh
				).on('success', function(rSource) {
					this.setupEnvironment(source, rSource);
				}.bind(this)).on('failure', function() {
					this.loader.emit('failure');
				}.bind(this)).get();
			}.bind(this));
			
	} else {
		this.loader.on('success', this.setupEnvironment.bind(this));
	}

	this.loader
		.on('failure', function(){
			log('Failure on SourceHandler.Loader', arguments);
		}.bind(this))
		.get();

}

SourceHandler.prototype = new events.EventEmitter;

// Format of marked LINK: @@##__fullname#displayname__##@@
//                    OR: @@##__displayandfullname__##@@
//                    EG: @@##__jQuery.fn.data#this.data__##@@
SourceHandler.LINKIFY_MARKER = ['@@##__', '__##@@'];

SourceHandler.prototype.setupEnvironment = function(source, preRequiredSource) {
	this.source = source;

	preRequiredSource = preRequiredSource || ''; // e.g. jQuery for jQuery UI (requirement)
	
	this.env = new SourceHandler.Environment(
		this.nullify + ';' + preRequiredSource + ';' + this.source
	);

	this.env.on('ready', function(){
		this.resolver = new SourceHandler.Resolver(this.env, this.source, this.libData);
		this.emit('ready');
	}.bind(this));

	this.env.init();
};

SourceHandler.prototype.findSingleMethod = function(method) {

	var resolved = this.resolver.resolve(method),
		location = resolved.location,
		start,
		end,
		source;

	if (resolved && resolved.fullyQualifiedName && resolved.method) {

		start = location.start;
		end = location.end;

		if (this.validateMethod(resolved)) {

			log('Function resolved', this.meth);

			var related = this.resolver.getMethods(resolved, function(fn){
				return fn !== resolved.method;
			}).slice(0, 12);

			// Change start/end to take `expand` into account:
			if (this.expandSourceN) {
				start = Math.max(1, start - this.expandSourceN);
				end += this.expandSourceN;
			}

			// Grab the bit of source we want to show from the entire source:
			source = this.source.split(/[\r\n]/);
			end = Math.min(source.length - 1, end); // End shouldn't be more than full source length
			source = source.slice(start - 1, end).join('\n');

			this.emit('sourceData', {

				from: 'findSingleMethod',

				source: this.linkifySource(source, resolved),

				full_source: this.source,

				start: start,
				end: end,

				function_start: location.start - start,
				function_end: (location.start - start) + (location.end - location.start),

				name: resolved.fullyQualifiedName,
				namespace: resolved.namespace,

				related: related,

				// Grab the real version directly from the source
				// (if we're given a `get_real_version` regex to work with)
				version: this.libData.get_real_version ? (
					this.source.match(RegExp(this.libData.get_real_version)
				) || [,this.ver])[1] : this.ver

			});

		}
	
	} else {
		this.emit('failure', '`' + this.meth + '` not found :(');
	}

};

SourceHandler.prototype.findAllMethods = function() {
	
	var me = this,
		ret = {},
		namespaces = this.libData.look_in,
		methods;

	for (var i = -1, l = namespaces.length; ++i < l;) {
		methods = this.resolver.getMethods({namespace: namespaces[i]});
		if (methods) {
			ret[namespaces[i]] = methods.map(function(item){
				item.link =
					'/' + me.lib +
					'/' + me.ver +
					'/' + item.fullyQualifiedName;
				return item;
			}).sort(function(a,b){
				// Alphabetically sort.
				return a.name < b.name ? -1 : 1;
			});
		}
	}

	this.emit('sourceData', {

		from: 'findAllMethods',
		methods: ret,

		// Grab the real version directly from the source
		// (if we're given a `get_real_version` regex to work with)
		version: this.libData.get_real_version ? (
			this.source.match(RegExp(this.libData.get_real_version)
		) || [,this.ver])[1] : this.ver

	});

};

SourceHandler.prototype.validateMethod = function(resolved, emit) {

	if (emit === void 0) emit = true;

	if (typeof resolved.method !== 'function') {
		emit && this.emit('failure', '`' + this.meth + '` is not a function. Sorry, I only know how to show you functions.');
		return false;
	}

	if (/\[native code\]/.test(resolved.string)) {
		emit && this.emit('failure', 'I am not allowed to show you native functions.');
		return false;
	}

	if (/^function *\(\) *\{ *\}$/.test(resolved.string)) {
		emit && this.emit('failure', 'Why would I show you an empty function?');
		return false;
	}

	if (!resolved.location) {
		emit && this.emit('failure', 'I found `'+this.meth+'` but it does not appear in the source of ' + this.lib);
		return false;
	}

	return true;

};

SourceHandler.prototype.linkifySource = function(source, parentFnResolved) {

	// Locate and linkify other methods within source (add marker for linkification)
	
	var me = this,
		lookIn = '(' + this.libData.look_in.join('|')
				// Escape all except '|' which we need...
				.replace(/[-[\]{}()*+?.,\\^$#\s]/g, "\\$&") + '|this' + ')';

	return source.replace(

		RegExp('([^0-9a-z_$])(' + lookIn + '\.([a-zA-Z0-9$_]+))', 'gi'),

		function($0, pre, full, namespace, name) {

			// Pre is ([^0-9a-z_$])
			// Used because we can't use lookbehinds to ensure that this was
			// not preceded by a legal identifier character. 

			var fullName = full;

			if (/^this\./.test(full)) {
				fullName = parentFnResolved.namespace + '.' + name;
			}
			
			var resolved = me.resolver.resolve(fullName);

			if ( resolved && me.validateMethod(resolved, false /* don't emit */) ) {
				return pre + SourceHandler.LINKIFY_MARKER[0] + fullName + '#' + full + SourceHandler.LINKIFY_MARKER[1];
			}

			return pre + full;

		}

	);

};
