var _ = require('underscore');
var bf = require('./bloomfilter.js'),
    BloomFilter = bf.BloomFilter,
    fnv_1a = bf.fnv_1a,
    fnv_1a_b = bf.fnv_1a_b;

(function(exports) {

	var shortBl, longBl1, longBl2, middleBl = null;

	exports.learn = function(pos, neg) {
		shortBl = new BloomFilter(1200000, 1);
		longBl1 = new BloomFilter(60000, 2);
		longBl2 = new BloomFilter(60000, 2);
		middleBl = new BloomFilter(100000, 2);
		middleBl2 = new BloomFilter(100000, 2);

		_.each(pos, function(w) { 
			if(w.length < 50)
				shortBl.add(w)
			else
			{
				//if(w.slice(-2) === "'s") w = w.slice(0,-2)
	
				longBl1.add(w.slice(0,4))
				longBl2.add(w.slice(-4))		
				if(w.length > 7)
					middleBl.add(w.slice(w.length/2 - 2, w.length/2 + 2))		
				if(w.length > 7)
					middleBl2.add(w.slice(w.length/2 - 1, w.length/2 + 3))		
			}
		});

		console.log("Sizes: " + shortBl.size() + "," + longBl1.size() + "," + longBl2.size() + "," + middleBl.size() + "," + middleBl2.size())

		console.log("Length: " + (JSON.stringify([].slice.call(shortBl.buckets)).length + JSON.stringify([].slice.call(longBl1.buckets)).length + 
			JSON.stringify([].slice.call(longBl2.buckets)).length + JSON.stringify([].slice.call(middleBl.buckets)).length + 
			JSON.stringify([].slice.call(middleBl2.buckets)).length)/1024)

		var array = [].slice.call(shortBl.buckets),
    	json = JSON.stringify(array)
    	return json
	}


	exports.init = function(data) {
		//positives = new BloomFilter(JSON.parse(data), 2);
	}

	exports.test = function(w) { 
		//return positives.test(word);
		if(w.length < 50) return shortBl.test(w)

		//if(w.slice(-2) === "'s")  w = w.slice(0,-2)

		var l = longBl1.test(w.slice(0,4)) && longBl2.test(w.slice(-4))
		if(w.length > 7)
			l = l && middleBl.test(w.slice(w.length/2 - 2, w.length/2 + 2)) 
		if(w.length > 7)
			l = l && middleBl2.test(w.slice(w.length/2 - 1, w.length/2 + 3)) 
		return l
	}


})(typeof exports !== "undefined" ? exports : this);