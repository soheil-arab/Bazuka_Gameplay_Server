
var requestHTTP = require('request');

requestHTTP.post(
                          'http://212.47.232.223/rest/update_match_result',
                          {
                              form: {
                                  roomID: 12,
                                  user1ID: 38,
                                  user2ID: 37,
                                  winner: 0,
                                  user1Score: 1,
                                  user2Score: 2,
                                  turn: 18
                              }
                          },
                          function (error, response, res_body) { console.log(res_body)});