var log = require('./jsapi.log.js'),
	similarity = require('similarity');

/**
 * SourceHandler.Resolver
 * Takes care of method/namespace resolving
 **/
module.exports = Resolver = function SHResolver(env, source, libConfig) {
	this.env = env;
	this.source = source;
	this.config = libConfig;
	this.namespaces = this.config.look_in;
};

Resolver.FN_RESOLVER = '\
for (var __r__, __i__ = -1, __l__ = __names__.length; ++__i__ < __l__;) {\
	try {\
		if (__r__ = eval(__names__[__i__])) {\
			window.__fqName__ = __names__[__i__];\
			return __r__;\
		}\
	} catch(e) {}\
}';

Resolver.prototype = {
	
	resolve: function(method) {

		var window = this.env.window,
			fqName,
			namespaces = (this.namespaces && this.namespaces.slice()) || [],
			resolver = Resolver.FN_RESOLVER,
			resolved,
			resolvedNamespace;

		namespaces = namespaces.map(function(n){
			return n + '.' + method;
		});
			
		namespaces.unshift(method); // push meth on front so its tried first!
		
		resolved = window.Function('__names__', resolver.toString())(namespaces);

		fqName = window.__fqName__ && this.correctName(window.__fqName__);

		resolvedNamespace = fqName && fqName.replace(/\.([^.]+)$/, '');

		return {
			fullyQualifiedName: fqName,
			namespace: resolvedNamespace,
			method: resolved,
			methodName: fqName.split('.').pop(),
			string: resolved && resolved.toString(),
			location: resolved && this.getLocationInSource(resolved.toString())
		};

	},

	correctName: function(fqMethodName) {

		// Correct the fully-qualified name according to `mutate_names` rules spec'd in libs.json

		var nameRules = this.config.mutate_names;
		
		if (nameRules) {
			for (var i = -1, l = nameRules.length; ++i < l;) {
				fqMethodName = fqMethodName.replace( RegExp(nameRules[i][0]), nameRules[i][1] );
			}
		}

		return fqMethodName;

	},

	getLocationInSource: function(fnString) {

		var sansFunc = fnString.replace(/^function *\([^\)]*\) *\{/, ''),
			index = this.source.indexOf(sansFunc),
			start = index > -1 && (this.source.substring(0, index).match(/[\n\r]/g)||[]).length + 1,
			end = index > -1 && start + (sansFunc.match(/[\n\r]/g)||[]).length;

		if (!start) return false;

		return {
			start: start,
			end: end
		};

	},

	getMethods: function(relatedTo /* from `this.resolve` */, fnCheck) {
		
		log('Getting other fns from namespace', relatedTo.namespace);
		
		// Get other fns from namespace in [{link: '/lib/...', name: '...'}, ...] format

		var namespace = relatedTo.namespace,
			methodName = relatedTo.methodName,
			window = this.env.window,
			ret = [],
			obj = window.Function('return ' + namespace)(),
			hasOwn = window.Object().hasOwnProperty;

		log('LISTING METHODS', methodName);

		fnCheck = fnCheck || function(){ return true; };

		for (var i in obj) {
			if (
				obj[i] &&
				hasOwn.call(obj, i) &&
				obj[i] instanceof window.Function &&
				fnCheck(obj[i]) &&
				!/\[native code\]/.test(obj[i].toString()) && 
				!/^function *\(\) *\{ *\}$/.test(obj[i].toString())
			) {
				ret.push({
					name: i,
					fullyQualifiedName: namespace + '.' + i,
					namespaces: namespace
				});
			}
		}

		return methodName ? similarity.sort(
			ret.map(function(item){
				item.toString = function() {
					return this.name;
				};
				return item;
			}),
			methodName
		) : ret;

	},

	sortMethodsBySimilarityTo: function(methods, to) {

		var regex = (function(){
			for (var ret = [], i = to.length; i--;)
				ret.push(to.replace(/[-[\]{}()*+?.,\\^$#\s|]/g, "\\$&").slice(0, i + 1));
			return RegExp(ret.join('|'), 'ig');
		}());

		return methods.sort(function(a,b){

			a = a.name;
			b = b.name;

			regex.lastIndex = 0;
			var matchA = (regex.exec(a)||['']).sort()[0],
				iA = (regex.lastIndex - matchA.length) * matchA.length - matchA.length;

			regex.lastIndex = 0;

			var matchB = (regex.exec(b)||['']).sort()[0],
				iB = (regex.lastIndex - matchB.length) * matchB.length - matchB.length;

			//console.log(a, matchA, iA, '->', (iB < iA ? 1 : -1));
			//console.log(b, matchB, iB);
			return matchA && matchB ? 
				(iB < iA ? 1 : -1)
				: matchA ? -1 : 1;
		});

	}

};