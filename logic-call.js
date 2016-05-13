(function(exports) {

  var bl = null;

  var decTree = {}
  var minCode = ""
  exports.init = function(buf) {
    var data = JSON.parse(buf.toString())
    minCode = data.minCode
    eval(minCode)
    var t = data.tree.split("x").join("If (feature ").split("y").join("Else (feature ").split("z").join("Predict: ").split('\n')
    addToTree(decTree, t)
    data.vData = new Buffer(data.vDataBuf, 'base64')
    bl = new Filter(data)
  }

  exports.test = function(w) { 
    eval(minCode)

      var p = predictTree(decTree, calcFeatures(w))
      if(p === "0") return false;
      w = w.substring(0,6)
      return bl.contains(new Buffer(w))
  }

})(typeof exports !== "undefined" ? exports : this);