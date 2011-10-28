
/**
 * JQMacroSelector
 * $:$ div $:closest form $:find a
 * Translates to: $('div').closest('form').find('a')
 */

jQuery.macroSelector = function(selector) {

	var $ = jQuery,
		rMacro = /^\$:/,
		cur = $(document),
		m = selector.match(/\$:[\w+$]+|.+?(?=\$:|$)/g),
		m0, m1;

	while (m.length) {

		m0 = m[0].replace(/^\s+|\s+$/, '');
		m1 = m[1] && m[1].replace(/^\s+|\s+$/, ''); // next item

		if (!m0) {
			m.shift();
			continue;
		}

		if (rMacro.test(m0)) {
			if (!m1 || rMacro.test(m1)) {
					cur = cur[m.shift().replace(rMacro,'')]();
			} else {
					cur = cur[m.shift().replace(rMacro,'')](m.shift());
			}
		} else {
			cur = cur.find(m.shift());
		}

	}

	cur = $.unique(cur);


	return cur;

};
