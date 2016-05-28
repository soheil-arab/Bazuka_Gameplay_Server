var requestHTTP = require('request');

requestHTTP.post('http://sl.hexino.ir/rest/update_match_result',
    {
        form:{
            roomID: 3,
            user1ID: 18,
            user2ID: 20,
            winner: 0,
            turn: 3
        }   
    },function (error, response, res_body) {
        console.log(res_body)
    })