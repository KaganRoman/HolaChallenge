(function(exports) {

  var bl = null;

  var d = {}
  var m = ""
  exports.init = function(b) {
    var data = JSON.parse(b.toString())
    m = data.minCode
    eval(m)
    bt(d, data.tree)
    data.vData = new Buffer(data.vDataBuf, 'base64')
    bl = new Filter(data)
  }

  exports.test = function(w) { 
    eval(m)
      var p = pt(d, cf(w))
      if(p === "0") return false;
      w = w.substring(0,6)
      return bl.contains(new Buffer(w))
  }

})(typeof exports !== "undefined" ? exports : this);