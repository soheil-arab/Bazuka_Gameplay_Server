/**
 * Created by soheil on 3/27/16.
 */
"use strict";

var DEBUG = true;

process.title = 'hexino-game-play-service';

// Port where we'll run the websocket server
var webSocketsServerPort = 16170;

// websocket and http servers
var webSocketServer = require('websocket').server;
var http = require('http');
var chalk = require('chalk');
var url = require('url');
var requestHTTP = require('request');
var fs = require('fs');

//var Chalk = {
//
//};
var chalkError = chalk.bold.red;
var chalkInMsg = chalk.blue.bgYellow;
//var chalkOutMsg = chalk.green.bgYellow;
var chalkNotif = chalk.bgCyan;
var chalkDate = chalk.bgWhite.black;

/**
 * Global variables
 */

var clients_connection = {};
var rooms = {};
//var user_deck_dict = {};
var room_metadata = {};
var disconnect_rooms = {};
var disconnect_users = {};
var turn_time = 35 * 1000;
var reject_time = 20 * 1000;
var server = http.createServer(function (request, response) {
});
server.listen(webSocketsServerPort, function () {
    logger(chalk.bgWhite.black(new Date()) + ' -> \n\t' + chalkNotif("Server is listening on port " + webSocketsServerPort));
});

/**
 * WebSocket server
 */

var wsServer = new webSocketServer({
    httpServer: server,
    autoAcceptConnections: false,
    keepalive: true,
    keepaliveInterval: 5000,
    dropConnectionOnKeepaliveTimeout: true,
    keepaliveGracePeriod: 2000
});


wsServer.on('request', function (request) {

    var connection = acceptConnection(request);
    connection.on('message', function (message) {
        if (message.type === 'utf8') {
            if (DEBUG)
                logger(chalkDate(new Date()) + ' ->\n\t' + chalkNotif('message utf8Data :') + chalkInMsg(message.utf8Data));
        }
        else if (message.type === 'binary') {
            logger('Received Binary Message of ' + message.binaryData.length /*+ ' bytes :\n' + message.binaryData.toString('hex')*/);
            var dataBuffer = message.binaryData;
            var header = parseHeader(dataBuffer);
            var room = rooms[header.roomID];
            var srcUID = header.userID;
            if (room_metadata[header.roomID]['state'] != 'play' && room_metadata[header.roomID]['state'] != 'finish_1')
                return;
            var message_object = dataBuffer.slice(24);
            console.log(header);
            switch (header.msgType) {
                case 3:
                    var state_num = header.dataRes1;
                    logger('match_state received :D ' + state_num + ' from ' + srcUID);

                    if (room_metadata[header.roomID]['match_state'][state_num] == undefined) {
                        //fs.writeFile("state_"+srcUID+"_"+state_num+".bin",message_object);
                        room_metadata[header.roomID]['match_state'][state_num] = message_object;
                        room_metadata[header.roomID]['last_state'] =
                          room_metadata[header.roomID]['last_state'] < state_num ?
                            state_num :
                            room_metadata[header.roomID]['last_state'];
                        logger(chalkInMsg("last state " + room_metadata[header.roomID]['last_state']));
                        room_metadata[header.roomID]['log_file_ws'].write(dataBuffer);

                    }
                    else {
                        //fs.writeFile("state_"+srcUID+"_"+state_num+".bin",message_object);                                                                        
                        logger(chalkInMsg('match state mismatch check --> ' + header.roomID + ' ' +
                                room_metadata[header.roomID]['match_state'][state_num].compare(message_object)));

                        if (room_metadata[header.roomID]['match_state'][state_num].compare(message_object) != 0) {
                            fs.writeFile(room_metadata[header.roomID]['log_file_err'] + "_state#" + state_num + "_1.log", room_metadata[header.roomID]['match_state'][state_num], function (err) {
                                if (!err) {
                                    fs.writeFile(room_metadata[header.roomID]['log_file_err'] + "_state#" + state_num + "_2.log", message_object)
                                }
                            });
                        }
                    }

                    break;
                case 6:
                    //                    var turnID = bin2String(message_object);
                    logger('change turn struct data : ' + chalkInMsg(srcUID));
                    //if valid -->
                    var turn_idx = room_metadata[header.roomID]['turn_index'];
                    var currentTurn = room_metadata[header.roomID]['users'][turn_idx];
                    logger('current turn : ' + currentTurn.toString());
                    if (currentTurn == srcUID) {
                        room_metadata[header.roomID]['turn_count'] += 1;
                        //clearTimeout(room_metadata[header.roomID]['timeout_obj']);
                        room_metadata[header.roomID]['turn_index'] = 1 - room_metadata[header.roomID]['turn_index'];
                        room_metadata[header.roomID]['log_file_ws'].write(dataBuffer);
                        for (var i = 0 ; i < room.length ; i++) {
                            var uid = room[i];
                            if (uid == srcUID || uid == undefined)
                                continue;
                            try {
                                clients_connection[uid].sendBytes(message.binaryData, function (err) {
                                    if (err) {
                                        logger('send byte error ' + chalkError(err));
                                    }
                                    else {
                                        logger(chalkDate(new Date()) + ' ->\n\t' + chalkNotif('message sent to ') + uid);
                                    }
                                });
                            } catch (e) {
                                logger(chalkError('message to ' + uid + " received exception : " + e));
                            }
                        }

                        //room_metadata[header.roomID]['timeout_obj'] =
                        //    setTimeout(setTurnTimeout, turn_time, room_metadata[header.roomID], header.roomID);
                        //room_metadata[header.roomID]['change_turn_time'] = new Date().getTime();

                    }
                    else {
                        logger(chalkError('invalid change turn request'));
                    }





                    break;
                case 5:
                    console.log(message_object);
                    const buf1 = Buffer.allocUnsafe(32);
                    message_object.copy(buf1, 0, 0, 32);
                    var winnerID = buf1.toString('utf8');
                    var p1score, p2score;
                    const buf2 = Buffer.allocUnsafe(4);
                    const buf3 = Buffer.allocUnsafe(4);
                    message_object.copy(buf2,0,32,36);
                    message_object.copy(buf3,0,36,40);
                    console.log(buf2);
                    console.log(buf3);
                    p1score = buf2.readInt32LE(0);
                    p2score = buf3.readInt32LE(0);
                    console.log('winnerID : ' + winnerID + ' p1score : ' + p1score + ' p2score : ' + p2score);
                    if (room_metadata[header.roomID]['state'] == 'play') {
                        room_metadata[header.roomID]['state'] = 'finish_1';
                        room_metadata[header.roomID]['winner_1'] = winnerID;
                        room_metadata[header.roomID]['p1score_1'] = p1score;
                        room_metadata[header.roomID]['p2score_1'] = p2score;
                    }
                    else if (room_metadata[header.roomID]['state'] == 'finish_1') {
                        room_metadata[header.roomID]['state'] = 'finish';
                        if (winnerID != room_metadata[header.roomID]['winner_1'] ||
                            p1score != room_metadata[header.roomID]['p1score_1'] ||
                            p2score != room_metadata[header.roomID]['p2score_1']) {

                            logger(chalkError("client cheats in finish state"));
                            break;

                        }
                        room_metadata[header.roomID]['log_file_ws'].write(dataBuffer);
                        console.log('p1score : ' + p1score + ' p2score : ' + p2score);
                        requestHTTP.post(
                          'http://212.47.232.223/rest/update_match_result',
                          {
                              form: {
                                  roomID: header.roomID,
                                  user1ID: room_metadata[header.roomID]['users'][0],
                                  user2ID: room_metadata[header.roomID]['users'][1],
                                  winner: room_metadata[header.roomID]['users'][0] == winnerID ? 0 : 1,
                                  user1Score: p1score,
                                  user2Score: p2score,
                                  turn: room_metadata[header.roomID]['turn_count']
                              }
                          },
                          function (error, response, res_body) {
                              if (!error && response.statusCode == 200) {
                                  console.log(res_body)
                                  var x = JSON.parse(res_body);
                                  var user1 = (x['user1']);
                                  var user2 = (x['user2']);
                                  var _roomID = x['roomID'];
                                  for (var i = 0; i < room.length; i++) {

                                      var _uid = room_metadata[_roomID]['users'][i];
                                      const buf = Buffer.allocUnsafe(36);
                                      buf.writeInt32LE(_uid, 0);
                                      buf.writeInt32LE(_roomID, 4);
                                      buf.writeInt32LE(127, 8);
                                      buf.writeInt32LE(12, 12);
                                      buf.writeInt32LE(0, 16);
                                      buf.writeInt32LE(0, 20);


                                      if (_uid == user1['userID']) {
                                          buf.writeInt32LE((x['winner'] == 0 ? 1 : 0), 24);
                                          buf.writeInt32LE(user1['trophy_sum'], 28);
                                          buf.writeInt32LE(user1['trophy_diff'], 32);

                                      } else if (_uid == user2['userID']) {
                                          buf.writeInt32LE((x['winner'] == 1 ? 1 : 0), 24);
                                          buf.writeInt32LE(user2['trophy_sum'], 28);
                                          buf.writeInt32LE(user2['trophy_diff'], 32);
                                      }

                                      try {
                                          clients_connection[_uid].sendBytes(buf, function (err) {
                                              if (err) {
                                                  logger(chalkDate(new Date()) + ' ->\n\t' + 'match_res err ' + chalkError(err));
                                              } else {

                                              }
                                          });
                                      } catch (e) {
                                          logger(chalkError('match_res exception message to ' + _uid + " exception : " + e));
                                      }
                                      room_metadata[_roomID]['log_file_ws'].end();

                                  }

                              }
                              //TODO: remove room metadata from memory
                              logger("room " + _roomID + " finished!");
                          }
                        );
                    }


                    break;

                default:
                    room_metadata[header.roomID]['log_file_ws'].write(dataBuffer);
                    for (var i = 0 ; i < room.length ; i++) {
                        var uid = room[i];
                        if (uid == srcUID || uid == undefined)
                            continue;
                        try {
                            clients_connection[uid].sendBytes(message.binaryData, function (err) {
                                if (err) {
                                    logger('send byte error ' + chalkError(err));
                                }
                                else {
                                    logger(chalkDate(new Date()) + ' ->\n\t' + chalkNotif('message sent to ') + uid);
                                }
                            });
                        } catch (e) {
                            logger(chalkError('message to ' + uid + " received exception : " + e));
                        }
                    }
                    break;
            }
        }
    });

    connection.on('close', function (reasonCode, description) {
        logger((new Date()) + ' -> \n\t' + chalkNotif("Connection ID: " + connection['userID'] + ' disconnected.'));
        var room = rooms[connection['roomID']];
        var roomID = connection['roomID'];
        var user = connection['userID'];
        var uid;
        if (room_metadata[roomID]['state'] != 'play')
            return;
        clients_connection[user] = undefined;

        if (room != undefined) {
            disconnect_users[user] = {};
            console.log(roomID + ' -> ' + user);
            disconnect_users[user]['roomID'] = roomID;
            console.log(room.length);
            for (var j = 0 ; j < room.length ; j++) {
                uid = room[j];
                if (uid == user)
                    room.splice(j, 1);
            }
            if (room.length == 0) {
                setTimeout(close_empty_room, 10 * 1000, 0, connection['roomID']);
            }
            console.log(room.length);
            disconnect_users[user]['timeout_obj'] = setTimeout(finishGameByLeave, reject_time, roomID, user);
        }
        //for (var i = 0 ; i < room.length ; i++) {
        //    uid = room[i];
        //    var dc_data = {
        //        header: JSON.stringify({
        //            msg_type: 'warning'
        //        }),
        //        msg_data: JSON.stringify({
        //            warning_type: 'pair_disconnected'
        //        })
        //    };
        //    clients_connection[_uid].sendUTF(JSON.stringify(dc_data));
        //}
        //if (room.length == 0) {
        //    match_state_dict[connection['roomID']] = 'failed';
        //    rooms[connection['roomID']] = undefined;
        //}
    });

});


function shuffle(array) {
    var currentIndex = array.length, temporaryValue, randomIndex;

    while (0 !== currentIndex) {

        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;
}

function verify_ticket(ticket, roomID, userID) {


    return true;
}

function logger(log_txt) {
    console.log(log_txt);
}


/**
 * @param {Buffer} buf byte array input
 */
function parseHeader(buf) {
    var userID = buf.readInt32LE(0);
    var roomID = buf.readInt32LE(4);
    var msgType = buf.readInt32LE(8);
    var msgLen = buf.readInt32LE(12);
    var dataRes1 = buf.readInt32LE(16);
    var dataRes2 = buf.readInt32LE(20);
    return {
        userID: userID,
        roomID: roomID,
        msgType: msgType,
        msgLen: msgLen,
        dataRes1: dataRes1,
        dataRes2: dataRes2
    };

}

/**
 *
 * @param request --> request object
 * connection = {
 *  userID,
 *  roomID,
 * }
 * room_metadata = {
 *  state, --> wait, play, 
 */
function acceptConnection(request) {

    var requestData = {
        UserID: parseInt(request.resourceURL.query.userID, 10),
        RoomID: parseInt(request.resourceURL.query.roomID, 10),
        DeviceID: request.resourceURL.query.userID,
        Ticket: 1//TODO: from query string
    };
    var verification = verify_ticket(requestData.Ticket, requestData.RoomID, requestData.UserID); //TODO: verify ticket with symetric encryption

    if (requestData.UserID == undefined || requestData.RoomID == undefined ||
        requestData.DeviceID == undefined || verification == false) {
        logger(chalkError("request not verified!"));
        return;
    }

    var connection = request.accept(null, request.origin);

    logger(chalkDate(new Date()) + ' ->\n\t' + chalkNotif(' New connection accepted. '));
    logger('\t' + chalkNotif('connection query is : ') + chalkInMsg(JSON.stringify(request.resourceURL.query)));

    connection['userID'] = requestData.UserID;
    connection['roomID'] = requestData.RoomID;
    clients_connection[requestData.UserID] = connection;

    if (rooms[requestData.RoomID] == undefined) {
        rooms[requestData.RoomID] = [];
        room_metadata[requestData.RoomID] = {};
        room_metadata[requestData.RoomID]['state'] = 'wait';
    }

    if (rooms[requestData.RoomID].length < 2 && room_metadata[requestData.RoomID]['state'] == 'wait') {
        rooms[requestData.RoomID].push(requestData.UserID);
    }

    var currentRoom = rooms[requestData.RoomID];
    logger(chalkInMsg('room len : ' + currentRoom.length + ' state : ' + room_metadata[requestData.RoomID]['state']));
    if (currentRoom.length == 2 && room_metadata[requestData.RoomID]['state'] == 'wait') {
        var dc_obj = disconnect_users[requestData.UserID];
        if (dc_obj != undefined) {
            if (dc_obj['roomID'] == requestData.RoomID) {
                clearTimeout(dc_obj['timeout_obj']);
            }
        }
        room_metadata[requestData.RoomID]['match_state'] = {};
        room_metadata[requestData.RoomID]['turn_count'] = 0;
        var init_buf = makeInintData(currentRoom, requestData);

        for (var i = 0 ; i < currentRoom.length ; i++) {
            var uid = currentRoom[i];
            try {
                clients_connection[uid].sendBytes(init_buf);
            }
            catch (e) {
                logger(chalkError('send init data exception : ' + e));
            }
        }
        //room_metadata[requestData.RoomID]['timeout_obj'] = (setTurnTimeout, turn_time, room_metadata[requestData.RoomID], requestData.RoomID);
        //room_metadata[requestData.RoomID]['change_turn_time'] = new Date().getTime();
        room_metadata[requestData.RoomID]['state'] = 'play';
        room_metadata[requestData.RoomID]['last_state'] = -1;
        room_metadata[requestData.RoomID]['log_file_ws'] = fs.createWriteStream('./log/room_' + requestData.RoomID + '_' + new Date().toISOString() + '.log',
          { flags: "w+", defaultEncoding: null, autoClose: true });
        room_metadata[requestData.RoomID]['log_file_err'] = './log/error/room_' + requestData.RoomID + '_' + new Date().toISOString();

        room_metadata[requestData.RoomID]['log_file_ws'].write(init_buf);
        logger(chalkDate(new Date()) + '->\n\t' + chalkNotif('init data sent to clients_connection :\n ') + chalkInMsg(Object.keys(clients_connection)));
    }
    else if (currentRoom.length <= 2 && room_metadata[requestData.RoomID]['state'] == 'play') {
        //TODO:disconnected user connected again
        logger(chalkInMsg("disconnected user connected again"));
        var recon_buf = makeReconnectData(requestData);
        try {
            connection.sendBytes(recon_buf, function (err) {
                if (err) {
                    logger('reconnect error');
                }
                else {
                    rooms[requestData.RoomID].push(requestData.UserID);
                    logger(chalkDate(new Date()) + '->\n\t' + chalkNotif('user joined again!'));
                }
            });
        }
        catch (e) {
            logger(chalkError('send reconnect data exception : ' + e));
        }
    }
    return connection;

}

/**
 *
 * @param metadata
 * @param roomID
 */
function setTurnTimeout(metadata, roomID) {

    clearTimeout(metadata['timeout_obj']);
    //TODO: send change turn to users
    var room = rooms[roomID];
    metadata['turn_index'] = 1 - metadata['turn_index'];
    metadata['turn_count'] += 1;
    const buf = Buffer.allocUnsafe(6 * 4 + 32);
    buf.writeInt32LE(0, 0);
    buf.writeInt32LE(roomID, 4);
    buf.writeInt32LE(6, 8);
    buf.writeInt32LE(30, 12);
    buf.writeInt32LE(0, 16);
    buf.writeInt32LE(0, 20);
    var turn_idx = metadata['turn_index'];
    logger("turn --> " + metadata["users"][turn_idx]);
    buf.write(metadata['users'][turn_idx].toString(), 24, 30);
    metadata['timeout_obj'] = setTimeout(setTurnTimeout, turn_time, metadata, roomID);
    metadata['change_turn_time'] = new Date().getTime();
    for (var i = 0 ; i < room.length ; i++) {
        var uid = room[i];
        try {
            clients_connection[uid].sendBytes(buf, function (err) {
                if (err) {
                    logger(chalkError("error in change turn send by server" + err));
                }
                else {
                    logger("change turn send automatically");
                }
            });
        }
        catch (e) {
            logger(chalkError('send change turn by server received exception : ' + e));
        }
    }



}

function makeInintData(currentRoom, requestData) {
    var turn_index = Math.floor(Math.random() * 2);
    var turn = rooms[requestData.RoomID][turn_index];
    var userID1 = currentRoom[0];
    var userID2 = currentRoom[1];
    var deck_order = [0, 1, 2, 3, 4, 5, 6, 7];
    room_metadata[requestData.RoomID]['users'] = [currentRoom[0], currentRoom[1]];
    room_metadata[requestData.RoomID]['turn_index'] = turn_index;

    var shuffled_order = shuffle(deck_order);
    const buf = Buffer.allocUnsafe(68);
    //    const buf = Buffer.allocUnsafe(68+60);

    //header struct
    buf.writeInt32LE(0, 0);
    buf.writeInt32LE(requestData.RoomID, 4);
    buf.writeInt32LE(0, 8);
    buf.writeInt32LE(44, 12);
    buf.writeInt32LE(0, 16);
    buf.writeInt32LE(0, 20);
    //init data
    buf.writeInt32LE(userID1, 24);
    buf.writeInt32LE(userID2, 28);
    buf.writeInt32LE(turn, 32);
    for (var i = 0; i < 8 ; i++) {
        buf.writeInt32LE(shuffled_order[i], 36 + (i * 4));
    }
    //    buf.write(username1, 68, 30);
    //    buf.write(username2, 98, 30);

    return buf;

}

function makeReconnectData(requestData) {

    var state_num = room_metadata[requestData.RoomID]['last_state'];
    var turn_idx = room_metadata[requestData.RoomID]['turn_index'];
    var turn = room_metadata[requestData.RoomID]['users'][turn_idx];

    var buf_size = 6 * 4 + 2 * 4 + room_metadata[requestData.RoomID]['match_state'][state_num].length;
    const buf = Buffer.allocUnsafe(buf_size);
    //header struct
    buf.writeInt32LE(0, 0);
    buf.writeInt32LE(requestData.RoomID, 4);
    buf.writeInt32LE(128, 8);
    buf.writeInt32LE(buf_size - 24, 12);
    buf.writeInt32LE(0, 16);
    buf.writeInt32LE(0, 20);
    //reconnect data
    buf.writeInt32LE(state_num, 24);
    buf.writeInt32LE(turn, 28);
    room_metadata[requestData.RoomID]['match_state'][state_num].copy(buf, 32);

    return buf;

}

function bin2String(array) {
    var result = "";
    for (var i = 0; i < array.length; i++) {
        result += String.fromCharCode(parseInt(array[i], 2));
    }
    return result;
}

function close_empty_room(counter, roomID) {
    if (counter >= 3) {
        //        clearTimeout(room_metadata[roomID]["timeout_obj"]);
        delete rooms[roomID];
        room_metadata[roomID]["state"] = "force_close";
    }
    else {
        setTimeout(close_empty_room, 10 * 1000, counter + 1, roomID);
    }
}


function finishGameByLeave(roomID, userID) {
    var score = {};
    if (room_metadata[roomID]['users'][0] == userID) {
        score['user1'] = -1;
        score['user2'] = 3;
        score['winner'] = 1;
    } else {
        score['user1'] = 3;
        score['user2'] = -1;
        score['winner'] = 0;
    }
    requestHTTP.post('http://212.47.232.223/rest/update_match_result', {
        form:
            {
                roomID: roomID,
                user1ID: room_metadata[roomID]['users'][0],
                user2ID: room_metadata[roomID]['users'][1],
                winner: score['winner'],
                user1Score: score['user1'],
                user2Score: score['user2'],
                turn: room_metadata[roomID]['turn_count']
            }
    }, function (error, response, res_body) {
        console.log(res_body)
        if (!error && response.statusCode == 200) {
            var x = JSON.parse(res_body);
            var user1 = (x['user1']);
            var user2 = (x['user2']);
            var _roomID = parseInt(x['roomID'],10);
            room_metadata[_roomID]['state'] = 'fuck state';
            var room = rooms[_roomID];
            console.log('fuckin current room : ' + room);
            for (var i = 0; i < room.length; i++) {
                var _uid = room[i];
                const buf = Buffer.allocUnsafe(36);
                buf.writeInt32LE(_uid, 0);
                buf.writeInt32LE(_roomID, 4);
                buf.writeInt32LE(127, 8);
                buf.writeInt32LE(12, 12);
                buf.writeInt32LE(0, 16);
                buf.writeInt32LE(0, 20);

                if (_uid == user1['userID']) {
                    buf.writeInt32LE((x['winner'] == 0 ? 1 : 0), 24);
                    buf.writeInt32LE(user1['trophy_sum'], 28);
                    buf.writeInt32LE(user1['trophy_diff'], 32);

                } else if (_uid == user2['userID']) {
                    buf.writeInt32LE((x['winner'] == 1 ? 1 : 0), 24);
                    buf.writeInt32LE(user2['trophy_sum'], 28);
                    buf.writeInt32LE(user2['trophy_diff'], 32);
                }
                if (clients_connection[room[i]] != undefined) {
                    try {
                        clients_connection[room[i]].sendBytes(buf, function (err) {
                            if (err) {
                                logger(chalkDate(new Date()) + ' ->\n\t' + 'match_res err ' + chalkError(err));
                            } else {
                            }
                        });
                    } catch (e) {
                        logger(chalkError('match_res exception message to ' + _uid + " exception : " + e));
                    }
                    room_metadata[_roomID]['log_file_ws'].end();
                    fs.writeFile('./log/ForceFinish/' + new Date().toISOString + '_room#' + roomID + '.log', userID);
                }
            }

        }
        //TODO: remove room metadata from memory
        logger("room " + _roomID + " finished!");
    });

}