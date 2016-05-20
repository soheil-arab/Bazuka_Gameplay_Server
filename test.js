var needle = require('needle');
var NodeRSA = require('node-rsa');
var fs = require('fs');
var sk = fs.readFileSync('./general_sk.pem', 'utf8');
var crypto = require('crypto');
var stringify = require('json-stable-stringify');
var gpSK = new NodeRSA(sk);



var data = {
    'time' : (new Date()).getTime().toString(),
    'user1ID' : 'user1',
    'user2ID' : 'user2',
    'winner' : '0'
};
console.log(stringify(data));
var h = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
console.log(h);
var signature = gpSK.sign(h, 'base64', 'hex');
console.log(signature);
data['b64sign'] = signature;

//needle.post('http://www.alpha.hexino.ir/rest/update_match_result',data,function(err,resp){
//    console.log('err -> ' + err + '\nresponse -> \n' + resp);
//});

needle.post('localhost:8001/rest/update_match_result',data,function(err,resp){
    console.log('err -> ' + err + '\nresponse -> \n' + resp);
});