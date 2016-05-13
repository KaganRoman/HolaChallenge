var _ = require('underscore');
var BloomFilter = require('bloom-filter');

(function(exports) {

    var getEditDistance = function(a, b){
      if(a.length == 0) return b.length; 
      if(b.length == 0) return a.length; 

      var matrix = [];

      // increment along the first column of each row
      var i;
      for(i = 0; i <= b.length; i++){
        matrix[i] = [i];
      }

      // increment each column in the first row
      var j;
      for(j = 0; j <= a.length; j++){
        matrix[0][j] = j;
      }

      // Fill in the rest of the matrix
      for(i = 1; i <= b.length; i++){
        for(j = 1; j <= a.length; j++){
          if(b.charAt(i-1) == a.charAt(j-1)){
            matrix[i][j] = matrix[i-1][j-1];
          } else {
            matrix[i][j] = Math.min(matrix[i-1][j-1] + 1, // substitution
                                    Math.min(matrix[i][j-1] + 1, // insertion
                                             matrix[i-1][j] + 1)); // deletion
          }
        }
      }

      return matrix[b.length][a.length];
    };

    var shortBl, longBl1, longBl2, middleBl = null;

    exports.learn = function(pos, neg) {
        shortBl = BloomFilter.create(600000, 0.6);

        _.each(pos, function(w) { 
            w = w.substring(0,12)
        shortBl.insert(new Buffer(w))
        });

        var obj = shortBl.toObject();
        var nObj = {
            vData : _.reduce(obj.vData, function(memo,i) { 
                return memo + i.toString(36);
            }, "")
        }
        var json = JSON.stringify(nObj)

        var dist = [0,0,0,0,0,0,0,0,0,0,0];

        _.each(_.shuffle(neg), function(f) {
            var m = _.min(pos, function(t) {
                if(t == f) return 0;
                return getEditDistance(f, t);
            });
            var d = getEditDistance(f, m);
 
            if(d < 10) dist[d] = dist[d] + 1;
            else dist[10] = dist[10] + 1;

            var s = _.reduce(dist, function(i,n) { return i + n;}, 0);

            console.log(f + " -> " + m + " = " + d)

            if(s % 10 == 0){
                //console.log(dist)
                //console.log(_.map(dist, function(i) { return Math.round(i*100.0/s)}) + " " + s);
            } 
        })
        console.log(dist);
        /*
        console.log("Sizes: " + shortBl.size() + "," + longBl1.size() + "," + longBl2.size() + "," + middleBl.size() + "," + middleBl2.size())

        console.log("Length: " + (JSON.stringify([].slice.call(shortBl.buckets)).length + JSON.stringify([].slice.call(longBl1.buckets)).length + 
            JSON.stringify([].slice.call(longBl2.buckets)).length + JSON.stringify([].slice.call(middleBl.buckets)).length + 
            JSON.stringify([].slice.call(middleBl2.buckets)).length)/1024)

        var array = [].slice.call(shortBl.buckets),
        json = JSON.stringify(array)
        return json
        */
        return json
    }


    exports.init = function(data) {
    }

    exports.test = function(w) { 
        //return positives.test(word);
             w = w.substring(0,12)

        return shortBl.contains(new Buffer(w))
        return false;
    }


})(typeof exports !== "undefined" ? exports : this);