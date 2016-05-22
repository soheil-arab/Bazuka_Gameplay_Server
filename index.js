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
var match_state_dict = {};
var room_state_dict = {};
var room_metadata = {};

var turn_time = 1500 * 1000;

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
            console.log('Received Binary Message of ' + message.binaryData.length /*+ ' bytes :\n' + message.binaryData.toString('hex')*/);
            var dataBuffer = message.binaryData;
            var header = parseHeader(dataBuffer);
            var room = rooms[header.roomID];
            var srcUID = header.userID;
            var message_object = dataBuffer.slice(24);
            console.log(header);
            switch (header.msgType) {
                case 3:
                    var state_num = header.dataRes1;
                    logger('match_state received :D ' + state_num + ' from '+ srcUID);

                    if (room_metadata[header.roomID]['match_state'][state_num] == undefined) {
                        room_metadata[header.roomID]['match_state'][state_num] = message_object;
                        room_metadata[header.roomID]['last_state'] =
                          room_metadata[header.roomID]['last_state'] < state_num ?
                            state_num :
                            room_metadata[header.roomID]['last_state'];
                    }
                    else {
                    	fs.writeFile('./state_1_'+state_num+'.bin',room_metadata[header.roomID]['match_state'][state_num]);
                    	fs.writeFile('./state_2_'+state_num+'.bin',message_object);
                        logger(
                          chalkNotif('match state mismatch check --> ' + header.roomID + ' ' +
                            room_metadata[header.roomID]['match_state'][state_num].compare(message_object)));
                    }

                    break;
                case 5:
                    var winnerID = message_object.readUInt32LE(0);
                    if (room_metadata[header.roomID]['state'] == 'play') {
                        room_metadata[header.roomID]['state'] = 'finish_1';
                        room_metadata[header.roomID]['winner_1'] = winnerID;
                    }
                    else if (room_metadata[header.roomID]['state'] == 'finish_1') {
                        room_metadata[header.roomID]['state'] = 'finish';
                        if (winnerID != room_metadata[header.roomID]['winner_1']) {
                            logger(chalkError("client cheats in finish state"));
                        }
                        requestHTTP.post(
                          'http://alpha.hexino.ir/rest/update_match_result',
                          {
                              form: {
                                  user1ID: room[0],
                                  user2ID: room[1],
                                  winner: room[0] == winnerID ? 0 : 1
                              }
                          },
                          function (error, response, body) {

                              if (!error && response.statusCode == 200) {
                                  var res_body = body.replace(/\\+/g, "").replace(/"{/g, '{').replace(/}"/g, '}');
                                  logger(chalkNotif(res_body));
                                  var x = JSON.parse(res_body);
                                  var user1 = (x['user1']);
                                  var user2 = (x['user2']);
                                  for (var i = 0; i < room.length; i++) {

                                      var _uid = room[i];
                                      const buf = Buffer.allocUnsafe(36);
                                      buf.writeUInt32LE(_uid, 0);
                                      buf.writeUInt32LE(header.roomID, 4);
                                      buf.writeUInt32LE(127, 8);
                                      buf.writeUInt32LE(12, 12);
                                      buf.writeUInt32LE(0, 16);
                                      buf.writeUInt32LE(0, 20);


                                      if (_uid == user1['userID']) {
                                          buf.writeUInt32LE((x['winner'] == 0 ? 1 : 0), 24);
                                          buf.writeUInt32LE(user1['trophy'], 28);
                                          buf.writeUInt32LE(user1['added_trophy'], 32);

                                      } else if (_uid == user2['userID']) {
                                          buf.writeUInt32LE((x['winner'] == 1 ? 1 : 0), 24);
                                          buf.writeUInt32LE(user1['trophy'], 28);
                                          buf.writeUInt32LE(user1['added_trophy'], 32);
                                      }
                                      logger(buf.toString('hex'));

                                      try {
                                          clients[_uid].sendBytes(buf, function (err) {
                                              if (err) {
                                                  logger('match_res err ' + chalkError(err));
                                              } else {
                                                  logger(chalkDate(new Date()) + ' ->\n\t' + chalkNotif('match_result sent to ') + _uid);
                                              }
                                          });
                                      } catch (e) {
                                          logger(chalkError('match_res exception message to ' + _uid + " exception : " + e));
                                      }
                                  }

                              }
                              //TODO: remove room metadata from memory
                              logger("room " + _roomID + " finished!");
                          }
                        );
                    }


                    break;
                default:
                    for (var i = 0 ; i < room.length ; i++) {
                        var uid = room[i];
                        if (uid == srcUID || uid == undefined)
                            continue;
			logger('default uid --> ' + uid);
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
        var user = connection['userID'];
        clients_connection[user] = undefined;
        for (var i = 0 ; i < room.length ; i++) {
            var _uid = room[i];
            if (_uid == user)
                room.splice(i, 1);
        }
        for (var i = 0 ; i < room.length ; i++) {
            var _uid = room[i];
            //var dc_data = {
            //    header: JSON.stringify({
            //        msg_type: 'warning'
            //    }),
            //    msg_data: JSON.stringify({
            //        warning_type: 'pair_disconnected'
            //    })
            //};
            //clients_connection[_uid].sendUTF(JSON.stringify(dc_data));
        }
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
    var userID = buf.readUInt32LE(0);
    var roomID = buf.readUInt32LE(4);
    var msgType = buf.readUInt32LE(8);
    var msgLen = buf.readUInt32LE(12);
    var dataRes1 = buf.readUInt32LE(16);
    var dataRes2 = buf.readUInt32LE(20);
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
    if (rooms[requestData.RoomID].length < 2 && room_metadata[requestData.RoomID]['state'] == 'wait')
        rooms[requestData.RoomID].push(requestData.UserID);

    var currentRoom = rooms[requestData.RoomID];

    if (currentRoom.length == 2 && room_metadata[requestData.RoomID]['state'] == 'wait') {
        room_metadata[requestData.RoomID]['match_state'] = {};
        //var turn = currentRoom[0];
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
        //setTimeout(setTurnTimeout, turn_time, room_metadata[requestData.RoomID], requestData.RoomID);
        room_metadata[requestData.RoomID]['state'] = 'play';
        room_metadata[requestData.RoomID]['last_state'] = -1;
        logger(chalkDate(new Date()) + '->\n\t' + chalkNotif('init data sent to clients_connection :\n ' + Object.keys(clients_connection)));
    }
    else if (currentRoom.length < 2 && room_state_dict[requestData.RoomID] == 'play') {
        //TODO:disconnected user connected again
        var recon_buf = makeReconnectData(currentRoom, requestData);
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


function setTurnTimeout(metadata, roomID) {
    clearTimeout(metadata['timeout_obj']);
    //TODO: send change turn to users
    var room = rooms[roomID];
    var index = room.indexOf(metadata['turn']);
    metadata['turn'] = room[1 - index];
    metadata['timeout_obj'] = setTimeout(setTurnTimeout, turn_time, metadata, roomID);
    const buf = Buffer.allocUnsafe(6*4 + 4);
    buf.writeUInt32LE(0, 0);
    buf.writeUInt32LE(roomID, 4);
    buf.writeUInt32LE(6, 8);
    buf.writeUInt32LE(30, 12);
    buf.writeUInt32LE(0, 16);
    buf.writeUInt32LE(0, 20);
    logger("turn --> " + metadata["turn"]);
    buf.write(metadata['turn'].toString(), 24,30);

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
    var deck_order = [1, 2, 3, 4, 5, 6, 7, 8];
    room_metadata[requestData.RoomID]['turn'] = turn;

    var shuffled_order = shuffle(deck_order);
    const buf = Buffer.allocUnsafe(68);
    //    const buf = Buffer.allocUnsafe(68+60);


    buf.writeUInt32LE(0, 0);
    buf.writeUInt32LE(requestData.RoomID, 4);
    buf.writeUInt32LE(0, 8);
    buf.writeUInt32LE(44, 12);
    buf.writeUInt32LE(0, 16);
    buf.writeUInt32LE(0, 20);

    buf.writeUInt32LE(userID1, 24);
    buf.writeUInt32LE(userID2, 28);
    buf.writeUInt32LE(turn, 32);
    for (var i = 0; i < 8 ; i++) {
        buf.writeUInt32LE(shuffled_order[i], 36 + (i * 4));
    }
    //    buf.write(username1, 68, 30);
    //    buf.write(username2, 98, 30);

    return buf;

}

function makeReconnectData(currentRoom, requestData) {

    var state_num = match_state_dict[requestData.RoomID]['last_state'];
    var turn = room_metadata[requestData.RoomID]['turn'];

    var buf_size = 6 * 4 + 2 * 4 + room_metadata[requestData.RoomID]['match_state'][state_num].length;
    const buf = Buffer.allocUnsafe(buf_size);

    buf.writeUInt32LE(0, 0);
    buf.writeUInt32LE(requestData.RoomID, 4);
    buf.writeUInt32LE(128, 8);
    buf.writeUInt32LE(buf_size - 24, 12);
    buf.writeUInt32LE(0, 16);
    buf.writeUInt32LE(0, 20);

    buf.writeUInt32LE(state_num, 24)
    buf.writeUInt32LE(turn, 28);
    room_metadata[requestData.RoomID]['match_state'][state_num].copy(buf, 32);

    return buf;

}
