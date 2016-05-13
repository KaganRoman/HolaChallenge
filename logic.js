(function(exports) {

  var bl = null;

  var decTree = {}

  exports.init = function(data) {
    var t = data.tree.split("x").join("If (feature ").split("y").join("Else (feature ").split("z").join("Predict: ").split('\n')
    addToTree(decTree, t)
    data.vData = new Buffer(data.vDataBuf, 'base64')
    bl = new Filter(data)
  }

  exports.test = function(w) { 
      var p = predictTree(decTree, calcFeatures(w))
      if(p === "0") return false;
      w = w.substring(0,6)
      return bl.contains(new Buffer(w))
  }

  var addToTree = function(tree, lines) {
    if(!lines || lines.length == 0) return
    var line = lines.shift().trim()
    if(line.indexOf("If ") === 0 || line.indexOf("Else") === 0)
    {
      if(line.indexOf("If ") === 0) tree.Tp = "If"; 
      else tree.Tp = "Else";
      var s = line.split(" ");
      tree.Ft = s[2];
      tree.Op = s[3];
      var values = s[4];
      if(s[3] === "not") {
        tree.Op = tree.Op + " " + s[4]
        values = s[5]
      }
      if (s[3] == "in" || s[4] == "in") tree.Values = JSON.parse("[" + values.trim().replace("{","").replace("}","").replace(")","") + "]");
      else tree.Values = [parseFloat(values.trim().replace(")", ""))]
      tree.LeftChild = {}
      addToTree(tree.LeftChild, lines);

      if (line.indexOf("If ") === 0)
      {
          tree.RightChild = {}
          addToTree(tree.RightChild, lines);
      }
    }
    if (line.indexOf("Predict:") === 0)
    {
        tree.Tp = "Prediction";
        tree.Pr = line.split(" ")[1];
     }    
  }

  var predictTree = function(tree, features) {
      if (tree.Tp === "Prediction") return tree.Pr;
      if (tree.Tp === "If" || tree.Tp === "Else")
      {
          var val = features[tree.Ft];
          var treeVal = tree.Values[0];
          if (tree.Op === "<" && val <= treeVal) return predictTree(tree.LeftChild, features);
          if (tree.Op === ">" && val > treeVal) return predictTree(tree.LeftChild, features);
          if (tree.Op === "in" || tree.Op == "not in")
          {
              var has = tree.Values.indexOf(val) != -1;
              if(has && tree.Op == "in" || !has && tree.Op == "not in") return predictTree(tree.LeftChild, features);
          }
          if(tree.RightChild != null) return predictTree(tree.RightChild, features);
      }
      return "";
  }

  var vowels = ['a', 'e', 'i', 'o', 'u'];

  var calcFeatures = function(s) {
   
    var chArray = s.split("");
    var vCnt = 0;
    for(i = 0; i < chArray.length; ++i)
      { if(vowels.indexOf(chArray[i]) != -1) vCnt=vCnt+1; }
    var sCnt = 0;
    for(i = 0; i < chArray.length; ++i)
      { if(vowels.indexOf(chArray[i]) === -1) sCnt=sCnt+1; }
    var cntRatio = (sCnt > 0) ? vCnt*1.0/sCnt : 1;
    var arr = [s.length, vCnt, sCnt, cntRatio];
    for(i = 0; i < 10; ++i) {
        if(i >= s.length) arr.push(27.0)
        else {
          var a = s.charCodeAt(i) - 97;
          if(a === -58) a = 26.0;
          arr.push(a)
        }
    }
    return arr;
  }

function Filter(arg) {
    this.vData = arg.vData;
    this.nHashFuncs = arg.nHashFuncs;
    this.nTweak = arg.nTweak || 0;
    this.nFlags = arg.nFlags || Filter.BLOOM_UPDATE_NONE;
}

Filter.prototype.hash = function hash(nHashNum, vDataToHash) {
  var h = MurmurHash3(((nHashNum * 0xFBA4C795) + this.nTweak) & 0xFFFFFFFF, vDataToHash);
  return h % (this.vData.length * 8);
};

Filter.prototype.insert = function insert(data) {
  for (var i = 0; i < this.nHashFuncs; i++) {
    var index = this.hash(i, data);
    var position = (1 << (7 & index));
    this.vData[index >> 3] |= position;
  }
  return this;
};

Filter.prototype.contains = function contains(data) {
  if (!this.vData.length) {
    return false;
  }
  for (var i = 0; i < this.nHashFuncs; i++) {
    var index = this.hash(i, data);
    if (!(this.vData[index >> 3] & (1 << (7 & index)))) {
      return false;
    }
  }
  return true;
};


function MurmurHash3(seed, data) {

  var c1 = 0xcc9e2d51;
  var c2 = 0x1b873593;
  var r1 = 15;
  var r2 = 13;
  var m = 5;
  var n = 0x6b64e654;

  var hash = seed;

  function mul32(a, b) {
    return (a & 0xffff) * b + (((a >>> 16) * b & 0xffff) << 16) & 0xffffffff;
  }

  function sum32(a, b) {
    return (a & 0xffff) + (b >>> 16) + (((a >>> 16) + b & 0xffff) << 16) & 0xffffffff;
  }

  function rotl32(a, b) {
    return (a << b) | (a >>> (32 - b));
  }

  var k1;

  for (var i = 0; i + 4 <= data.length; i += 4) {
    k1 = data[i] |
      (data[i + 1] << 8) |
      (data[i + 2] << 16) |
      (data[i + 3] << 24);

    k1 = mul32(k1, c1);
    k1 = rotl32(k1, r1);
    k1 = mul32(k1, c2);

    hash ^= k1;
    hash = rotl32(hash, r2);
    hash = mul32(hash, m);
    hash = sum32(hash, n);
  }

  k1 = 0;

  switch(data.length & 3) {
    case 3:
      k1 ^= data[i + 2] << 16;
    case 2:
      k1 ^= data[i + 1] << 8;
    case 1:
      k1 ^= data[i];
      k1 = mul32(k1, c1);
      k1 = rotl32(k1, r1);
      k1 = mul32(k1, c2);
      hash ^= k1;
  }

  hash ^= data.length;
  hash ^= hash >>> 16;
  hash = mul32(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = mul32(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;

  return hash >>> 0;
}

})(typeof exports !== "undefined" ? exports : this);