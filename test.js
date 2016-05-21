var _ = require('underscore');
var BloomFilter = require('bloom-filter');
var fs = require("fs")
var zlib = require('zlib')
const logic = require('./logic-call-min.js');

var getTree = function() {
	var t1 = fs.readFileSync('tree6.txt').toString();
	var t2 = t1.split('\t').join('').split("If (feature ").join("x").split("Else (feature ").join("y").split("Predict: ").join("z").split("<=").join('<').split(".0,").join(',').split(".0\r\n").join('\r\n').split(".0}").join('}')
	var t3 = _.reduce(t2.split('\r\n'), function(i, n) { return i + n.trim() + '\n';}, "")

	var vals = _.range(28);
	var t4 = _.reduce(t3.split('\n'), function(memo, line) { 
		var n = line
		if(line.indexOf("x") === 0 || line.indexOf("y") === 0) {
	      var s = line.split(" ");
	      var values = s[2];
	      var op = "in"
	      if(s[1] === "not") {
	        op = "not in"
	        values = s[3]
	      }
	      if (s[1] === "in" || s[2] === "in") {
	       		values = JSON.parse("[" + values.trim().replace("{","").replace("}","").replace(")","") + "]");
	       		var notValues = _.filter(vals, function(v) { return !_.contains(values, v)});
	       		if(values.length > notValues.length)
	       		{
	       			if(op === "in") 
	       				op = "not in" 
	       			else 
	       				op = "in"
	       			n = s[0] + " " + op + " {" + notValues.join(',') + "})"
	       		}
	   		}
		}

		return memo + n + '\n';
	}, "")	
	return t4;
}

var tree = getTree()
var minCode = 'function Filter(i){this.vData=i.vData,this.nHashFuncs=i.nHashFuncs,this.nTweak=i.nTweak||0,this.nFlags=i.nFlags||Filter.BLOOM_UPDATE_NONE}function MurmurHash3(i,t){function e(i,t){return(65535&i)*t+(((i>>>16)*t&65535)<<16)&4294967295}function r(i,t){return(65535&i)+(t>>>16)+(((i>>>16)+t&65535)<<16)&4294967295}function n(i,t){return i<<t|i>>>32-t}for(var a,s=3432918353,l=461845907,h=15,f=13,u=5,o=1801774676,p=i,c=0;c+4<=t.length;c+=4)a=t[c]|t[c+1]<<8|t[c+2]<<16|t[c+3]<<24,a=e(a,s),a=n(a,h),a=e(a,l),p^=a,p=n(p,f),p=e(p,u),p=r(p,o);switch(a=0,3&t.length){case 3:a^=t[c+2]<<16;case 2:a^=t[c+1]<<8;case 1:a^=t[c],a=e(a,s),a=n(a,h),a=e(a,l),p^=a}return p^=t.length,p^=p>>>16,p=e(p,2246822507),p^=p>>>13,p=e(p,3266489909),p^=p>>>16,p>>>0}var buildTree=function(i,t){var e=t.split("x").join("If (feature ").split("y").join("Else (feature ").split("z").join("Predict: ").split("\\n");addToTree(i,e)},addToTree=function(i,t){if(t&&0!=t.length){var e=t.shift().trim();if(0===e.indexOf("If ")||0===e.indexOf("Else")){0===e.indexOf("If ")?i.Tp="If":i.Tp="Else";var r=e.split(" ");i.Ft=r[2],i.Op=r[3];var n=r[4];"not"===r[3]&&(i.Op=i.Op+" "+r[4],n=r[5]),"in"==r[3]||"in"==r[4]?i.Values=JSON.parse("["+n.trim().replace("{","").replace("}","").replace(")","")+"]"):i.Values=[parseFloat(n.trim().replace(")",""))],i.LeftChild={},addToTree(i.LeftChild,t),0===e.indexOf("If ")&&(i.RightChild={},addToTree(i.RightChild,t))}0===e.indexOf("Predict:")&&(i.Tp="Prediction",i.Pr=e.split(" ")[1])}},predictTree=function(i,t){if("Prediction"===i.Tp)return i.Pr;if("If"===i.Tp||"Else"===i.Tp){var e=t[i.Ft],r=i.Values[0];if("<"===i.Op&&r>=e)return predictTree(i.LeftChild,t);if(">"===i.Op&&e>r)return predictTree(i.LeftChild,t);if("in"===i.Op||"not in"==i.Op){var n=-1!=i.Values.indexOf(e);if(n&&"in"==i.Op||!n&&"not in"==i.Op)return predictTree(i.LeftChild,t)}if(null!=i.RightChild)return predictTree(i.RightChild,t)}return""},vowels="aeiou".split(""),nvw="bcdfghjklmnpqrstvwxyz".split(""),fq=[.084,.018,.0397,.03,.1027,.01,.022,.026,.08,.0018,.009,.052,.029,.068,.0674,.029,.0016,.067,.097,.061,.033,.0091,.007,.0027,.018,.0031,.0233,0],maxl=function(t,e){var r=0,n=0,a=t.length-1;for(i=0;i<a;++i)-1!=e.indexOf(t[i])?n+=1:n=0,n>r&&(r=n);return r},calcFeatures=function(t){var e=t.split(""),r=0;for(i=0;i<e.length;++i)-1!=vowels.indexOf(e[i])&&(r+=1);var n=0;for(i=0;i<e.length;++i)-1===vowels.indexOf(e[i])&&(n+=1);var a=n>0?1*r/n:1,s=[e.length,r,n,a],l=[27,27,0,-1,-1,-1],h=0,f=[],u=t.length;for(10>u&&(u=10),i=0;i<u;++i){var o=t.charCodeAt(i)-97;i>=t.length?o=27:-58===o&&(o=26,i>0&&27===l[0]&&(l[0]=f[i-1]),l[2]++,-1===l[3]&&(l[3]=i),l[3]>=0&&(l[4]=t.length-l[3]-1),-1!=l[3]&&(l[5]=(l[3]+1)/t.length)),f.push(o),h+=fq[o]}for(-1!=l[3]&&l[3]<t.length-1&&(l[1]=f[l[3]+1]),i=0;i<10;++i)s.push(f[i]);for(i=0;i<6;++i)s.push(l[i]);return s.push(maxl(t,vowels)),s.push(maxl(t,nvw)),s.push(h/t.length),s};Filter.prototype.hash=function(i,t){var e=MurmurHash3(4221880213*i+this.nTweak&4294967295,t);return e%(8*this.vData.length)},Filter.prototype.insert=function(i){for(var t=0;t<this.nHashFuncs;t++){var e=this.hash(t,i),r=1<<(7&e);this.vData[e>>3]|=r}return this},Filter.prototype.contains=function(i){if(!this.vData.length)return!1;for(var t=0;t<this.nHashFuncs;t++){var e=this.hash(t,i);if(!(this.vData[e>>3]&1<<(7&e)))return!1}return!0};'

var learn = function(pos, neg) {
	bl = BloomFilter.create(190000, 0.2665);
	eval(minCode)

  	var decTree = {}
    buildTree(decTree, tree)

	_.each(pos, function(w) { 
      var p = predictTree(decTree, calcFeatures(w))
      if(p === "0") return;

	  w = w.substring(0,6)

	    bl.insert(new Buffer(w))
	});
	var m = new Buffer(bl.vData).toString('base64')
	console.log("Length: " + m.length/1024);

	return { vDataBuf : m, nHashFuncs: bl.nHashFuncs, nTweak : bl.nTweak, nFlags : bl.nFlags }
}

var positive = fs.readFileSync('utrueWords.txt').toString().toLowerCase().split('\r\n');
var negative = fs.readFileSync('ufalseWords.txt').toString().toLowerCase().split('\r\n');

var positiveFound = 0;
var negativeFound = 0;

var data = learn(positive, negative);

data.tree = tree

data.minCode = minCode

//console.log(data.tree)

var ser = JSON.stringify(data)
console.log("Learn data size: " + ser.length)
fs.writeFileSync("res.txt", ser);

fs.writeFileSync("r.zip", zlib.gzipSync(ser)); 

var zzz = fs.readFileSync('r.zip'); // optional
zzz = zlib.gunzipSync(zzz); 

//logic.init(new Buffer(deser));
logic.init(zzz);

var predictions = [[],[],[],[]];
_.each(positive, function(word) {
	if(logic.test(word)) positiveFound = positiveFound + 1;
	else predictions[1].push(word)
})

_.each(negative, function(word) {
	if(!logic.test(word)) {negativeFound = negativeFound + 1; predictions[2].push(word);}
	else { predictions[3].push(word)}
})

console.log("True Positive: " + (positiveFound*100)/positive.length + "%");
console.log("True Negative: " + (negativeFound*100)/negative.length + "%");

var score = (positiveFound*50)/positive.length + (negativeFound*50)/negative.length
console.log("Score: " + score + "%")

fs.writeFileSync("tN.txt", predictions[1]);
fs.writeFileSync("fP.txt", predictions[2]);
fs.writeFileSync("fN.txt", predictions[3]);
