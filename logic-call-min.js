!function(exports){var bl=null,d={},m="";exports.init=function(b){var data=JSON.parse(b.toString());m=data.minCode,eval(m),bt(d,data.tree),data.vData=new Buffer(data.vDataBuf,"base64"),bl=new Filter(data)},exports.test=function(w){eval(m);var p=pt(d,cf(w));return"0"===p?!1:(w=w.substring(0,6),bl.contains(new Buffer(w)))}}("undefined"!=typeof exports?exports:this);