var WebSocket = require('ws');
var ws = new WebSocket('ws://localhost:8080/');

ws.on('open', function open() {
});
ws.on('message',function(msg){
    console.log(msg);
});