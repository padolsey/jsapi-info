var events = require('events'),
	fs = require('fs'),
	http = require('http'),
	url = require('url'),
	jsdom = require('jsdom'),
	log = require('./jsapi.log.js');

// SourceLocator takes a lib/ver/meth and fires a success event (with data)
// when it finds the source of the function (incl. line number). It fires
// 'failure' when it can't find it or another error occurs.

module.exports = SourceLocator = function SourceLocator(lib, ver, meth, libData) {

	events.EventEmitter.call( this );

	var me = this;

	this.lib = lib;
	this.ver = ver;
	this.meth = meth;

	this.libData = libData;

	this.filename = './libs/' + this.lib + '.' + this.ver + '.js';
	
	fs.stat(this.filename, function(err, stats) {
		if (err && err.code === 'ENOENT') {
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
	this.env = jsdom.env({
		html: '<div></div>',
		src: [SourceLocator.JSAPI.jsdomFixes, this.source],
		done: done
	});
};

SourceLocator.RESOLVER = '\
for (var __r__, __i__ = -1, __l__ = __names__.length; ++__i__ < __l__;) {\
	try {\
		if (__r__ = eval(__names__[__i__])) {\
			window.__fqName__ = __names__[__i__];\
			return __r__;\
		}\
	} catch(e) {}\
}';

SourceLocator.prototype.find = function() {

	log('find()', !!this.source);

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
	
		var lookIn = me.libData.look_in,
			fqName,
			names = (lookIn && lookIn.slice()) || [],
			resolve = SourceLocator.RESOLVER,
			resolvedFn;
	
		names = names.map(function(n){
			return n + '.' + me.meth;
		});
			
		names.unshift(me.meth);
			
		resolvedFn = window.Function('__names__', resolve.toString())(names);	

		fqName = window.__fqName__ && me.correctName(window.__fqName__);

		if (resolvedFn) {

			if (typeof resolvedFn !== 'function') {
				me.emit('failure', '`' + me.meth + '` is not a function. Sorry, I only know how to show you functions.');
				return;
			}

			if (/\[native code\]/.test(resolvedFn.toString())) {
				return me.emit('failure', 'I am not allowed to show you native functions.');
			}
	
			var fnLocation = me.getFnLocation(resolvedFn.toString());

			if (!fnLocation) {
				return me.emit('failure', 'I found `'+me.meth+'` but it does not appear in the source of ' + me.lib);
			}

			log('Fn found', me.meth);

			me.emit('success', {
				source: me.source.split(/[\r\n]/).slice(fnLocation.start - 1, fnLocation.end).join('\n') || resolvedFn.toString(),
				full_source: me.source,
				start: fnLocation.start,
				end: fnLocation.end,
				name: fqName,
				data: me.libData,
				version: me.libData.get_real_version ? (
					me.source.match(RegExp(me.libData.get_real_version)
				) || [,me.ver])[1] : me.ver
			});
	
		} else {
			me.emit('failure', '`' + me.meth + '` not found :(');
		}
	});

};

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
