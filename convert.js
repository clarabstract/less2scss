var less = require('less');

var parser = new(less.Parser)({
	paths: ['.'],
	filename: 'main.less'
});

function emitMixinArgValue(node) {
	var output = "";
	if (node.name) {
		if (node.name.match(/^@/)) {
			console.error("Param name is not variable", node)
			debugger
			throw("invalid parma name")
		};
		output += node.name.replace(/^@/, '$')+": "
	};
	output += emitValue(node.value)
	return output
}

function emitValue(node) {
	if (typeof node.value === "string") {
		return node.value
	};
	if (Array.isArray(node.value)) {
		return node.value.map(emitValue).join(' -*- ')
	};

	if (node.args) {
		return node.name + "(" + node.args.map(emitValue).join(', ') + ")"
	}
	
	if (node.unit) {
		if (node.unit.denominator.length > 0 || node.unit.numerator.length > 1) {
			console.error("mistery unit", node)
			debugger
			throw('mistery unit')
		};
		if (node.unit.denominator[0]) {
			return node.value + node.unit.denominator[0]
		} else {
			return node.value 	
		}
		
	};

	if (node.name && node.name.match(/^@/)) {
		return node.name.replace(/^@/, '$')
	}

	console.error("what else", node)
	debugger 
	throw("nope")

}
function emitProperty(node, indent) {
	var output = indent;
	var wtf = [];
	for (var i = 0; i < node.name.length; i++) {
		if (i===0) {
			output += node.name[0].value + ": "
		} else {
			wtf.push(node.name[i])
		}
	};
	if (wtf.length > 0) {
		console.error(wtf)
		throw("Wtf is with multiple property names:" + wtf.join("\n"))
	};
	var value = node.value.value;
	for (var i = 0; i < value.length; i++) {
		output += emitValue(value[i])
		if (i>1) {
			debugger
			throw('what is this?')
		};

		
	};

	output+=";"
	
	return output
}

function emitSelector(selector) {
	var output = ""
	for (var i = 0; i < selector.elements.length; i++) {
		var element = selector.elements[i]
		var combinator = element.combinator.value
		switch(combinator) {
			case " ":
				if (i===0) {
					combinator = "";
				};
			break;
			case ">":
				combinator = "> "
				if (i>0) {
					combinator = " > "
				};
			break;
		};
		
		output += combinator

		var value = element.value
		
		if (value === "&") {
			var next = selector.elements[i+1]
			if( next && next.combinator.value === "" && next.value.match(/^[-_a-zA-Z0=9]/)) {
				value = "#{&}"
			}
		};


		output += value
		
	};
	return output

}
function emit(node, indent) {
	var output = indent;
	var handled = false;
	if (node.path) {
		handled = true
		output += "@import url('" + node.path.value.value + "');"
	};
	
	if (node.selectors) {
		output += node.selectors.map(emitSelector).join(', ');
		output += " {\n"

		for (var i = 0; i < node.rules.length; i++) {
			var rule = node.rules[i];
			if (rule.name) {
				output += emitProperty(rule, indent + "  ") + "\n"
			} else {
				output += emit(rule, indent + "  ")
			}
		};
		output += indent
		output += "}\n"
		return output
	};

	if (node.selector) {
		var els = node.selector.elements
		if (node.arguments && els && els.length === 1) {
			var mixin = els[0]
			if (mixin.combinator && mixin.combinator.value === "" && mixin.value.match(/^\.[_a-zA-Z0-9]/)) {
				console.warn("Assuming "+mixin.value+" is a mixin!")
				return output + "+" + mixin.value.slice(1) + "(" + node.arguments.map(emitMixinArgValue).join(', ') + ");\n";

			};

		};
		// in any other case:
		console.error("Don't know how to convert mixin", node)
		debugger
		throw("no mixin")
	};

	if (node.value) {
		handled = true;
		output += node.value + "\n"
	}


	if (node.rules) {
		for (var i = 0; i < node.rules.length; i++) {
			handled = true;
			output += emit(node.rules[i], indent)
		};
	};
	if (node.root && node.root !== true) {
		handled = true;
		output += emit(node.root, indent)
	};

	


	if (!handled) {
		console.error("Unhandled:", node)
		debugger
		throw("unhandled node")
	};
	return output
}

parser.parse('@import "test.less";', function (err, tree) {
    if (err) { return console.error(err) }
    
    console.log(emit(tree, ""))
	
});