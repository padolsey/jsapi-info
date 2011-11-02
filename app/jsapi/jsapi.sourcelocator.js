var events = require('events'),
	fs = require('fs'),
	http = require('http'),
	url = require('url'),
	jsdom = require('jsdom'),
	log = require('./jsapi.log.js');

// SourceLocator takes a lib/ver/meth and fires a success event (with data)
// when it finds the source of the function (incl. line number). It fires
// 'failure' when it can't find it or another error occurs.

module.exports = SourceLocator = function SourceLocator(requestData, libData) {

	events.EventEmitter.call( this );

	var me = this;

	this.lib = requestData.lib;
	this.ver = requestData.ver;
	this.meth = requestData.meth;

	// The `nullify` array will contain items that need to be nullified
	// in order to correctly retrieve the lib's methods.
	// E.g. MooTools/Underscore implement Func-bind,
	// we need to nullify Function.prototype.bind so the SourceLocator
	// finds the libs' implementation instead of native.
	// (all occurs within jsdom context of course)
	this.nullify = libData.nullify && libData.nullify[0] ?
		libData.nullify.join('=null;') + '=null;' : '';

	this.libData = libData;

	this.filename = './_libs/' + this.lib + '.' + this.ver + '.js';
	
	fs.stat(this.filename, function(err, stats) {
		if (requestData.refresh || err && err.code === 'ENOENT') {
			me.getRemoteSource();
		} else if(err) {
			this.emit('failure', 'Error on file retrieval, ' + err.code);
		} else {
			me.getLocalSource();
		}
	});

};

SourceLocator.prototype = new events.EventEmitter;

SourceLocator.prototype.getRemoteSource = function() {

	var me = this,
		libURL = url.parse(
			this.libData.url.replace('{VERSION}', this.ver)
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
				me.find();
			});
		}
	);

	request.on('error', function(e){
		log("Got req error: " + e.message);
	});

};

SourceLocator.prototype.getLocalSource = function() {

	var me = this;

	fs.readFile(this.filename, 'utf8', function(err, data){
		if (err) {
			log('Error on reading from local source ('+me.filename+')', err);
		} else {
			log('Got local source', me.filename);
			me.source = data;
			me.find();
		}
	});

};

SourceLocator.prototype.makeEnv = function(done) {

	var tryStart = 'window.__errors__ = []; try {',
		tryEnd = '} catch(e) { window.__errors__.push(e); }';

	this.env = jsdom.env({
		html: '<div></div>',
		src: [SourceLocator.JSAPI.jsdomFixes, this.nullify, tryStart + this.source + tryEnd],
		done: done
	});

};

SourceLocator.FN_RESOLVER = '\
for (var __r__, __i__ = -1, __l__ = __names__.length; ++__i__ < __l__;) {\
	try {\
		if (__r__ = eval(__names__[__i__])) {\
			window.__fqName__ = __names__[__i__];\
			return __r__;\
		}\
	} catch(e) {}\
}';

SourceLocator.prototype.find = function() {

	var me = this,
		run = false;

	if (this.meth == '__all__') {
		this.emit('failure', 'Outputting ALL source at once currently DISABLED.');
		return;
		this.emit('success', {
			source: this.source,
			start: 1,
			end: this.source.match(/[\r\n]/g).length + 1
		});
		return;
	}

	this.makeEnv(function(errors, window){

		if (run) return;
		run = true;
		
		log('JSDOM EnvInit errors: ', errors);

		if (window.__errors__.length) {
			log('JSDOM context errors: ', me.requestData, window.__errors__);
			return me.emit('failure', 'JSDOM threw me an exception. It can\'t handle your lib apparently.');
		}
	
		var resolved = me.resolveMethod(window),
			location = resolved.location;

		if (resolved.fullyQualifiedName && resolved.method) {

			if (me.validateMethod(resolved)) {

				log('Function resolved', me.meth);

				me.emit('success', {

					source: me.linkifySource(

						window,

						// Try to use actual source, not just toString'd function.
						me.source
							.split(/[\r\n]/)
							.slice(
								location.start - 1,
								location.end
							)
							.join('\n')
						|| resolved.string

					),

					full_source: me.source,

					start: location.start,
					end: location.end,

					name: resolved.fullyQualifiedName,
					namespace: resolved.namespace,

					related: me.getRelated(window, resolved.namespace, resolved.method),

					// Grab the real version directly from the source
					// (if we're given a `get_real_version` regex to work with)
					version: me.libData.get_real_version ? (
						me.source.match(RegExp(me.libData.get_real_version)
					) || [,me.ver])[1] : me.ver

				});

			}
		
		} else {
			me.emit('failure', '`' + me.meth + '` not found :(');
		}
	});

};

SourceLocator.prototype.resolveMethod = function(window, method) {

	var method = method || this.meth,
		lookIn = this.libData.look_in,
		fqName,
		names = (lookIn && lookIn.slice()) || [],
		resolver = SourceLocator.FN_RESOLVER,
		resolved,
		namespace;

	names = names.map(function(n){
		return n + '.' + method;
	});
		
	names.unshift(method); // push meth on front so its tried first!
	
	resolved = window.Function('__names__', resolver.toString())(names);

	fqName = window.__fqName__ && this.correctName(window.__fqName__);

	namespace = fqName && fqName.replace(/\.([^.]+)$/, '');

	return {
		fullyQualifiedName: fqName,
		namespace: namespace,
		method: resolved,
		string: resolved && resolved.toString(),
		location: resolved && this.getFnLocation(resolved.toString())
	};

};

SourceLocator.prototype.validateMethod = function(resolved, emit) {

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

}

SourceLocator.prototype.correctName = function(fqMethodName) {

	// Correct the fully-qualified name according to `mutate_names` rules spec'd in libs.json

	var nameRules = this.libData.mutate_names;
	
	if (nameRules) {
		for (var i = -1, l = nameRules.length; ++i < l;) {
			fqMethodName = fqMethodName.replace( RegExp(nameRules[i][0]), nameRules[i][1] );
		}
	}

	return fqMethodName;

};

SourceLocator.prototype.getFnLocation = function(fnString) {
	//log('Getting fn location');

	var sansFunc = fnString.replace(/^function *\([^\)]*\) *\{/, '');

	var index = this.source.indexOf(sansFunc),
		start = index > -1 && this.source.substring(0, index).match(/[\n\r]/g).length + 1,
		end = index > -1 && start + (sansFunc.match(/[\n\r]/g)||[]).length;

	//log('Match', index);
	//log('LineNumber', start, end);

	if (!start) return false;

	return {
		start: start,
		end: end
	};

};

SourceLocator.prototype.getRelated = function(window, namespace, resolvedFn) {

	log('Getting other fns from namespace', namespace)
	
	// Get other fns from namespace in [{link: '/lib/...', name: '...'}, ...] format

	var ret = [],
		lookIn = this.libData.look_in,
		obj = window.Function('return ' + namespace)(),
		hasOwn = window.Object().hasOwnProperty;

	for (var i in obj) {
		if (
			obj[i] &&
			hasOwn.call(obj, i) &&
			obj[i] instanceof window.Function &&
			obj[i] !== resolvedFn &&
			!/\[native code\]/.test(obj[i].toString()) && 
			!/^function *\(\) *\{ *\}$/.test(obj[i].toString())
		) {
			ret.push({
				link: '/' + this.lib + '/' + this.ver + '/' + namespace + '.' + i,
				name: i
			});
		}
	}

	// Crappy shuffling
	ret.sort(function(a, b){
		return Math.random() > .5 ? -1 : 1;
	});

	return ret;

};

SourceLocator.LINKIFY_MARKER = ['@@##__', '__##@@'];
SourceLocator.prototype.linkifySource = function(window, source) {

	// Locate and linkify other methods within source (add marker for linkification)
	
	var me = this,
		lookIn = '(?:' + this.libData.look_in.join('|')
				// Escape all except '|' which we need...
				.replace(/[-[\]{}()*+?.,\\^$#\s]/g, "\\$&") + ')';

	return source.replace(

		RegExp(lookIn + '\.([a-zA-Z0-9$_]+)', 'g'),

		function($0, name) {
			
			var resolved = me.resolveMethod(window, name);

			if ( me.validateMethod(resolved, false /* don't emit */) ) {
				return SourceLocator.LINKIFY_MARKER[0] + $0 + SourceLocator.LINKIFY_MARKER[1];
			}

			return $0;

		}

	);

};
