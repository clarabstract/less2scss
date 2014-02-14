var less = require('less');

function clone(obj){
    if(obj == null || typeof(obj) != 'object')
        return obj;

    var temp = obj.constructor(); // changed

    for(var key in obj)
        temp[key] = clone(obj[key]);
    return temp;
}

var INDENT = "    ";
var NEST_LATER_TOKEN = "<<nest-later>>";

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
	try {
		if (node.unit) {
			if (node.unit.denominator.length > 0 || node.unit.numerator.length > 1) {
				console.error("mistery unit", node)
				debugger
				throw('misteryunit')
			};
			if (node.unit.numerator[0]) {
				return node.value + node.unit.numerator[0]
			} else {
				return node.value 	
			}
		};

		if (typeof node.value === "string") {
			return node.value
		};
		if (Array.isArray(node.value)) {
			return node.value.map(emitValue).join(' ')
		};

		if (node.args) {
			return node.name + "(" + node.args.map(emitValue).join(', ') + ")"
		}
		

		if (node.rgb) {
			if (node.alpha === 1) {
				return "rgb(" + node.rgb.join(', ') + ")";
			} else {
				return "rgba(" + node.rgb.join(', ') + ", " + node.alpha + ")";
			}
		}

		if (node.op) {
			if (node.operands.length !== 2) {
				console.error("non-binary operands", node)
				debugger
				throw("nonbinaryop")
			};
			return emitValue(node.operands[0]) + node.op + emitValue(node.operands[1])
		};

		if (node.name && node.name.match(/^@/)) {
			return node.name.replace(/^@/, '$')
		}

		if (node.value.value) {
			return emitValue(node.value)
		};

	} catch (e) {
		console.error("Error while processing value", node)
		throw(e)
	}

	console.error("unknown value node", node)
	debugger 
	throw("misteryvalue")

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

	output += value.map(emitValue).join(', ');

	output+=";"
	
	return output
}

function emitSelector(selector) {
	var output = "";
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
		if (value.key) {
			attrib_val = "[" + value.key;
			if (value.value && !value.op || !value.value && value.op) {
				console.error("Attribute selector only one of value or operand", value)
				debugger
				throw("attribnonop")
			};
			if (value.op) {
				attrib_val += value.op + value.value;
			};
			attrib_val += "]";
			value = attrib_val;

		};
		if(typeof value !== "string") {
			console.error("Non-string selector value", element)
			console.error("Selectors:", selector.elements)
			debugger
			throw("nonselector")
		}
		
		if (value === "&") {
			var next = selector.elements[i+1]

			// Problematic uses of &:
			// 		- attmepts to connect to a tag selector
			//		- is not the first selector in the chain
			// Sass minds these a lot - we have to generate a new block after the parent block and do the substitution
			// ourselves :(
			if( i > 0 || (next && next.combinator.value === "" || next.value.match(/^[-_a-zA-Z0=9]/))) {
				nestLater = true;
				value = NEST_LATER_TOKEN
			} 
		}

		output += value

		
	};
	return output

}
function emitRuleBlock(rules, indent, parent) {
	output = " {\n"

	for (var i = 0; i < rules.length; i++) {
		var rule = rules[i];
		if (rule.name) {
			output += emitProperty(rule, indent + INDENT) + "\n"
		} else {
			output += emit(rule, indent + INDENT, parent)
		}
	};
	output += indent
	output += "}\n\n"
	return output
}
function emit(node, indent, parent) {
	try {
		var output = indent;

		node.parent = parent;

		if (node.root && node.root !== true) {
			return output + emit(node.root, indent)
		};

		if (node.silent && node.value) {
			// It's a comment
			return output + node.value + "\n";
		};

		if (node.path) {
			return output + "@import url('" + node.path.value.value + "');\n"
		};
		
		if (node.selectors) {
			var selectors = node.selectors.map(emitSelector);
			var regularSelectors = [];
			var appendToParent = []
			for (var i = 0; i < selectors.length; i++) {
				var selector = selectors[i];
				if (selector.match(NEST_LATER_TOKEN)) {
					if (!parent && parent.rules) {
						console.error("&-marker used outside parent", node);
						debugger
						throw("parentrefinorphan")
					};
					for (var j = 0; j < parent.resolvedSelectors.length; j++) {
						appendToParent.push(
							selector.replace(NEST_LATER_TOKEN, parent.resolvedSelectors[j]));
					};
				} else {
					regularSelectors.push(selector);
				};
			};
			if (appendToParent.length > 0) {
				// Clone a self to append to parent

				// Temporarily clear parent to avoid cyclic clone...
				node.parent = null;
				var newRule = clone(node)
				node.parent = parent;
				// Reset selectors and add the resolved ones we wish to pass on:
				newRule.selectors = []
				for (var i = 0; i < appendToParent.length; i++) {
					newRule.selectors.push({
						elements: [{
							combinator: {value: ''},
							value: appendToParent[i]
						}]
					});
				};
				newRule.parent = parent.parent;
				idx = parent.parent.rules.indexOf(parent)
				if (idx == -1) {throw('orphan')};
				parent.parent.rules.splice(idx+1, 0, newRule);
			};

			node.resolvedSelectors = regularSelectors;
			blockContent = emitRuleBlock(node.rules, indent, node);

			if (regularSelectors.length === 0 || !blockContent.match(/[^\s{}]/)) {
				return ''
			};

			output += regularSelectors.join(', ');
			output += blockContent;
			return output;

		};

		if (node.selector) {
			var els = node.selector.elements
			if (node.arguments && els && els.length === 1) {
				var mixin = els[0]
				if (mixin.combinator && mixin.combinator.value === "" && mixin.value.match(/^\.[_a-zA-Z0-9]/)) {
					console.warn("Assuming "+mixin.value+" is a mixin!")
					return output + "@include " + mixin.value.slice(1) + "(" + node.arguments.map(emitMixinArgValue).join(', ') + ");\n";
				};

			};
			// in any other case:
			console.error("Don't know how to convert mixin", node)
			debugger
			throw("nonmixin")
		};

		if (node.name) {
			if (node.rules) {
				if (node.rules.length > 1) {
					console.error("multiple directive rule blocks", node.rules)
					debugger
					throw("multiblock")
				};
				return output + node.name + emitRuleBlock(node.rules[0].rules, indent, parent)
			} else {
				values = node.value.value
				if (!Array.isArray(values)) {
					values = [node.value]
				};
				return output + node.name + " " + values.map(emitValue).join(' ') + ";\n";
			}
			
		}

		if (node.rules) {
			for (var i = 0; i < node.rules.length; i++) {
				output += emit(node.rules[i], indent, node)
			};
			return output
		};

		if (node.value) {
			return output + emitValue(node.vaue)
		}

	} catch (e) {
		console.error("Error while processing node", node)
		throw(e)
	}
	
	
	console.error("Unhandled:", node)
	debugger
	throw("unhandlednode")
	
}

parser.parse('@import "test.less";', function (err, tree) {
    if (err) { return console.error(err) }
    
    console.log(emit(tree, ""))
	
});