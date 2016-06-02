/**
 * Created by soheil on 3/27/16.
 */
"use strict";

var DEBUG = true;

process.title = 'Bazuka_GPS';

// Port where we'll run the websocket server
var webSocketsServerPort = 16170;

// websocket and http servers
var webSocketServer = require('websocket').server;
var http = require('http');
var chalk = require('chalk');
var requestHTTP = require('request');
var fs = require('fs');

var chalkError = chalk.bold.red;
var chalkInMsg = chalk.blue.bgYellow;
//var chalkOutMsg = chalk.green.bgYellow;
var chalkNotif = chalk.bgCyan;
var chalkDate = chalk.bgWhite.black;

/**
 * Global variables
 */

var clients_connection = {};
var room_active_users = {};
var room_metadata = {};
var reject_time = 30 * 1000;
var init_wait_time = 10 * 1000;
var server = http.createServer(function (request, response) {
});
server.listen(webSocketsServerPort, function () {
    logger(chalk.bgWhite.black(new Date()) + ' -> \n\t' + chalkNotif("Server is listening on port " + webSocketsServerPort));
});

var game_state = {
    wait:0,
    play:1,
    fragilePlay:2,
    FirstFinish:3,
    Finish:4,
    closed:5
};
/**
 * WebSocket server
 */

var wsServer = new webSocketServer({
    httpServer: server,
    autoAcceptConnections: false,
    keepalive: true,
    keepaliveInterval: 1500,
    dropConnectionOnKeepaliveTimeout: true,
    keepaliveGracePeriod: 4000
});

wsServer.on('request', function (request) {
    try {
        var connection = acceptConnection(request);
        if (connection != null) {
            connection.on('message', function (message) {
                if (message.type === 'utf8') {
                    if (DEBUG)
                        logger(chalkDate(new Date()) + ' ->\n\t' + chalkNotif('message utf8Data :') + chalkInMsg(message.utf8Data));
                }
                else if (message.type === 'binary') {

                    //logger('Received Binary Message of ' + message.binaryData.length);
                    var dataBuffer = message.binaryData;
                    var header = parseHeader(dataBuffer);
                    var room = room_active_users[header.roomID];
                    var srcUID = header.userID;
                    if (room_metadata[header.roomID]['state'] == game_state.closed && room_metadata[header.roomID]['state'] == game_state.Finish)
                        return;
                    var message_object = dataBuffer.slice(24);
                    //console.log(header);
                    switch (header.msgType) {
                    /**********
                     match state
                     *********/
                        case 3:
                            var state_num = header.dataRes1;
                            //logger('from ' + srcUID + ' match state#' + state_num + ' received!');

                            if (room_metadata[header.roomID]['match_state'][state_num] == undefined) {
                                room_metadata[header.roomID]['match_state'][state_num] = message_object;
                                room_metadata[header.roomID]['last_state'] =
                                    room_metadata[header.roomID]['last_state'] < state_num ?
                                        state_num :
                                        room_metadata[header.roomID]['last_state'];
                                //logger(chalkInMsg("state#" + state_num + "wrote to log & last state is " + room_metadata[header.roomID]['last_state']));
                                room_metadata[header.roomID]['log_file_ws'].write(dataBuffer);
                            }
                            else {
                                //fs.writeFile("state_"+srcUID+"_"+state_num+".bin",message_object);
                                //logger(chalkInMsg('match state mismatch check --> ' + header.roomID + ' ' +
                                //    room_metadata[header.roomID]['match_state'][state_num].compare(message_object)));

                                if (room_metadata[header.roomID]['match_state'][state_num].compare(message_object) != 0) {
                                    fs.writeFile(room_metadata[header.roomID]['log_file_err'] + "_state#" + state_num + "_1.log", room_metadata[header.roomID]['match_state'][state_num], function (err) {
                                        if (!err) {
                                            fs.writeFile(room_metadata[header.roomID]['log_file_err'] + "_state#" + state_num + "_2.log", message_object)
                                        }
                                    });
                                }
                            }

                            break;
                    /**********
                     change turn
                     *********/
                        case 6:
                            //if valid -->
                            var turn_idx = room_metadata[header.roomID]['turn_index'];
                            var currentTurn = room_metadata[header.roomID]['users'][turn_idx];
                            //logger('change turn struct data from ' + chalkInMsg(srcUID));
                            //logger('current turn : ' + currentTurn.toString());
                            if (currentTurn == srcUID) {
                                room_metadata[header.roomID]['turn_count'] += 1;
                                room_metadata[header.roomID]['turn_index'] = 1 - room_metadata[header.roomID]['turn_index'];
                                room_metadata[header.roomID]['log_file_ws'].write(dataBuffer);
                                for (var i = 0; i < room.length; i++) {
                                    var uid = room[i];
                                    if (uid == srcUID || uid == undefined)
                                        continue;
                                    try {
                                        clients_connection[uid].sendBytes(message.binaryData, function (err) {
                                            if (err) {
                                                logger('change turn send err ' + chalkError(err));
                                            }
                                            else {
                                                //logger(chalkNotif('change turn sent to opponent'));
                                            }
                                        });
                                    } catch (e) {
                                        logger(chalkError('message to ' + uid + " received exception : " + e));
                                    }
                                }
                            }
                            else {
                                logger(chalkError('invalid change turn request'));
                            }
                            break;
                    /**********
                     Finish match
                     *********/
                        case 5:
                            const winnerID_buf = Buffer.allocUnsafe(32);
                            message_object.copy(winnerID_buf, 0, 0, 32);
                            var winnerID = winnerID_buf.toString('utf8');
                            winnerID = parseInt(winnerID);
                            var p1score, p2score;
                            const p1score_buf = Buffer.allocUnsafe(4);
                            const p2score_buf = Buffer.allocUnsafe(4);
                            message_object.copy(p1score_buf, 0, 32, 36);
                            p1score = p1score_buf.readInt32LE(0);
                            message_object.copy(p2score_buf, 0, 36, 40);
                            p2score = p2score_buf.readInt32LE(0);
                            if (room_metadata[header.roomID]['state'] == game_state.play) {
                                room_metadata[header.roomID]['state'] = game_state.FirstFinish;
                                room_metadata[header.roomID]['winner_1'] = winnerID;
                                room_metadata[header.roomID]['p1score_1'] = p1score;//Red Player
                                room_metadata[header.roomID]['p2score_1'] = p2score;//Blue Player

                            }
                            else if (room_metadata[header.roomID]['state'] == game_state.FirstFinish) {
                                room_metadata[header.roomID]['state'] = game_state.Finish;
                                if (winnerID != room_metadata[header.roomID]['winner_1'] ||
                                    p1score != room_metadata[header.roomID]['p1score_1'] ||
                                    p2score != room_metadata[header.roomID]['p2score_1']) {

                                    logger(chalkError("client cheats in finish state"));
                                    break;

                                }
                                room_metadata[header.roomID]['log_file_ws'].write(dataBuffer);

                                console.log({
                                    roomID: header.roomID,
                                    user1ID: room_metadata[header.roomID]['users'][0],
                                    user2ID: room_metadata[header.roomID]['users'][1],
                                    winner: room_metadata[header.roomID]['users'][0] == parseInt(winnerID, 10) ? 0 : 1,
                                    user1Score: p1score,
                                    user2Score: p2score,
                                    turn: room_metadata[header.roomID]['turn_count']
                                });

                                requestHTTP.post(
                                    'http://212.47.232.223/rest/update_match_result',
                                    {
                                        form: {
                                            roomID: header.roomID,
                                            user1ID: room_metadata[header.roomID]['users'][0],
                                            user2ID: room_metadata[header.roomID]['users'][1],
                                            winner: room_metadata[header.roomID]['users'][0] == parseInt(winnerID) ? 0 : 1,
                                            user1Score: p1score,
                                            user2Score: p2score,
                                            turn: room_metadata[header.roomID]['turn_count']
                                        }
                                    },
                                    function (error, response, res_body) {
                                        if (!error && response.statusCode == 200) {
                                            console.log('update match result response : ' + res_body);
                                            var x = JSON.parse(res_body);
                                            var user1 = (x['user1']);
                                            var user2 = (x['user2']);
                                            var _roomID = x['roomID'];
                                            room_metadata[_roomID]['state'] = game_state.Finish;
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

                                            }
                                            room_metadata[_roomID]['log_file_ws'].end();
                                            //delete room_metadata[_roomID]['match_state'];
                                            room_metadata[_roomID]['close_time'] = new Date().getTime();
                                            logger("room " + _roomID + " finished!");

                                        }
                                    }
                                );
                            }


                            break;

                        default:
                            room_metadata[header.roomID]['log_file_ws'].write(dataBuffer);
                            for (var i = 0; i < room.length; i++) {
                                var uid = room[i];
                                if (uid == srcUID || uid == undefined)
                                    continue;
                                try {
                                    clients_connection[uid].sendBytes(message.binaryData, function (err) {
                                        if (err) {
                                            logger('send byte error ' + chalkError(err));
                                        }
                                        else {
                                        }
                                    });
                                } catch (e) {
                                    logger(chalkError('forward message received an exception : ' + e));
                                }
                            }
                            break;
                    }
                }
            });

            connection.on('close', function (reasonCode, description) {
                logger((new Date()) + ' -> \n\t' + chalkNotif("Connection ID: " + connection['userID']) + chalkError(' disconnected.'));
                var roomID = connection['roomID'];
                var room = room_active_users[roomID];
                var userID = connection['userID'];
                if (room_metadata[roomID] == undefined || room == undefined) {
                    logger(chalkError('closed connection room is undefined'));
                    return;
                }
                var uid, j;
                if (room_metadata[roomID]['state'] == game_state.play) {
                    room_metadata[roomID]['state'] = game_state.fragilePlay;
                    room_metadata[roomID]['fragile_timeout'] = setTimeout(finishFragilePlay, reject_time, roomID, userID);
                    clients_connection[userID] = undefined;
                    for (j = 0; j < room.length; j++) {
                        uid = room[j];
                        if (uid == userID)
                            room.splice(j, 1);
                    }
                }

                else if (room_metadata[roomID]['state'] == game_state.fragilePlay) {
                    clients_connection[userID] = undefined;
                    for (j = 0; j < room.length; j++) {
                        uid = room[j];
                        if (uid == userID)
                            room.splice(j, 1);
                    }
                }
                else if (room_metadata[roomID]['state'] == game_state.wait) {
                    if (room[0] == userID) {
                        room_metadata[roomID]['state'] = game_state.closed;
                        clearTimeout(room_metadata[roomID]['init_timeout_obj']);
                    }
                }

            });

        }
    }catch(e){
        console.log(chalkError("exception in request handeling : " + e));
    }
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
    try {
        var requestData = {
            UserID: parseInt(request.resourceURL.query.userID, 10),
            roomID: parseInt(request.resourceURL.query.roomID, 10),
            DeviceID: request.resourceURL.query.userID,
            Ticket: 1//TODO: from query string
        };

        var verification = verify_ticket(requestData.Ticket, requestData.roomID, requestData.UserID); //TODO: verify ticket with symetric encryption

        if (requestData.UserID == undefined || requestData.roomID == undefined ||
            requestData.DeviceID == undefined || verification == false) {
            logger(chalkError("request not verified!"));
            return;
        }

        var connection = request.accept(null, request.origin);

        logger(chalkDate(new Date()) + ' ->\n\t' + chalkNotif(' New connection accepted. '));
        logger('\t' + chalkNotif('connection query is : ') + chalkInMsg(JSON.stringify(request.resourceURL.query)));

        connection['userID'] = requestData.UserID;
        connection['roomID'] = requestData.roomID;
        clients_connection[requestData.UserID] = connection;

        init_room_metadata(requestData.roomID);

        if (room_active_users[requestData.roomID].length < 2 && room_metadata[requestData.roomID]['state'] == game_state.wait) {
            room_active_users[requestData.roomID].push(requestData.UserID);
            room_metadata[requestData.roomID]['users'].push(requestData.UserID);
        }

        var roomUsers = room_active_users[requestData.roomID];
        logger(chalkInMsg('room# ' + requestData.roomID + ' room len ' + roomUsers.length + ' state : ' + room_metadata[requestData.roomID]['state']));


        /**********************
         wait --> play
         ***********************/
        if (roomUsers.length == 2 && room_metadata[requestData.roomID]['state'] == game_state.wait) {
            room_metadata[requestData.roomID]['state'] = game_state.play;
            clearTimeout(room_metadata[requestData.roomID]['init_timeout_obj']);
            var init_buf = makeInitData(requestData);
            for (var i = 0; i < 2; i++) {
                var uid = room_metadata[requestData.roomID]['users'][i];
                if (clients_connection[uid] != undefined) {
                    try {
                        clients_connection[uid].sendBytes(init_buf,
                            function () {
                                logger(chalkNotif('room#' + requestData.roomID + ' init data sent!'));
                            }
                        );
                    }
                    catch (e) {
                        logger(chalkError('send init data exception : ' + e));
                    }
                }
            }

            room_metadata[requestData.roomID]['log_file_ws'].write(init_buf);

        }

        /**********************
         fragilePlay --> play
         ***********************/
        else if (room_metadata[requestData.roomID]['state'] == game_state.fragilePlay) {
            //TODO: userid in room meta data users
            logger('fragile room length : ' + roomUsers.length);
            if (roomUsers.length == 1) {
                clearTimeout(room_metadata[requestData.roomID]['fragile_timeout']);
                room_active_users[requestData.roomID].push(requestData.UserID);
                room_metadata[requestData.roomID]['state'] = game_state.play;
            }
            logger(chalkInMsg("user#" + requestData.UserID + ' room#' + requestData.roomID + "  connected again"));
            var recon_buf = makeReconnectData(requestData);
            if (recon_buf != null) {
                try {
                    connection.sendBytes(recon_buf, function (err) {
                        if (err) {
                            logger('reconnect error');
                        }
                        else {
                            logger(chalkDate(new Date()) + '->\n\t' + chalkNotif('user joined again!'));
                        }
                    });
                }
                catch (e) {
                    logger(chalkError('send reconnect data exception : ' + e));
                }
            }
        }


        else if (room_metadata[requestData.roomID]['state'] == game_state.closed) {

        }
        else if (room_metadata[requestData.roomID]['state'] == game_state.Finish) {

        }
        else if (room_metadata[requestData.roomID]['state'] == game_state.FirstFinish) {
            logger(chalkInMsg("user#" + requestData.UserID + ' room#' + requestData.roomID + "  connected again --> first finish"));
            var recon_buf = makeReconnectData(requestData);
            if (recon_buf != null) {
                try {
                    connection.sendBytes(recon_buf, function (err) {
                        if (err) {
                            logger('reconnect error');
                        }
                        else {
                            logger(chalkDate(new Date()) + '->\n\t' + chalkNotif('user joined again!'));
                        }
                    });
                }
                catch (e) {
                    logger(chalkError('send reconnect data exception : ' + e));
                }
            }

        }

        return connection;

    }
    catch(e){
        console.log(chalkError("exception in accept connection : " + e));
    }
}

function makeInitData(requestData) {
    var turn_index = Math.floor(Math.random() * 2);
    room_metadata[requestData.roomID]['turn_index'] = turn_index;
    var turn = room_metadata[requestData.roomID]['users'][turn_index];
    var deck_order = [0, 1, 2, 3, 4, 5, 6, 7];
    var userID1 = room_metadata[requestData.roomID]['users'][0];
    var userID2 = room_metadata[requestData.roomID]['users'][1];
    var shuffled_order = shuffle(deck_order);
    const buf = Buffer.allocUnsafe(68);
    //    const buf = Buffer.allocUnsafe(68+60);
    //header struct
    buf.writeUInt32LE(0, 0);
    buf.writeUInt32LE(requestData.roomID, 4);
    buf.writeUInt32LE(0, 8);
    buf.writeUInt32LE(44, 12);
    buf.writeUInt32LE(0, 16);
    buf.writeUInt32LE(0, 20);
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

    var state_num = room_metadata[requestData.roomID]['last_state'];
    var turn_idx = room_metadata[requestData.roomID]['turn_index'];
    var turn = room_metadata[requestData.roomID]['users'][turn_idx];
    var buf_size;
    if(state_num == -1){
        buf_size = 6 * 4 + 2 * 4 ;
        const buf = Buffer.allocUnsafe(buf_size);
        //header struct
        buf.writeUInt32LE(0, 0);
        buf.writeUInt32LE(requestData.roomID, 4);
        buf.writeUInt32LE(128, 8);
        buf.writeUInt32LE(buf_size - 24, 12);
        buf.writeUInt32LE(0, 16);
        buf.writeUInt32LE(0, 20);
        //reconnect data
        buf.writeInt32LE(state_num, 24);
        buf.writeInt32LE(turn, 28);

        return buf;

    }
    else if(room_metadata[requestData.roomID]['match_state'][state_num] != undefined){
        buf_size = 6 * 4 + 2 * 4 + room_metadata[requestData.roomID]['match_state'][state_num].length;
        const buf = Buffer.allocUnsafe(buf_size);
        //header struct
        buf.writeInt32LE(0, 0);
        buf.writeInt32LE(requestData.roomID, 4);
        buf.writeInt32LE(128, 8);
        buf.writeInt32LE(buf_size - 24, 12);
        buf.writeInt32LE(0, 16);
        buf.writeInt32LE(0, 20);
        //reconnect data
        buf.writeInt32LE(state_num, 24);
        buf.writeInt32LE(turn, 28);
        room_metadata[requestData.roomID]['match_state'][state_num].copy(buf, 32);
        return buf;
    }
    else{
        logger(chalkError('what the hell is going on :D'));
        return null;
    }
}



function finishFragilePlay(roomID, userID) {
    try {
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
        room_metadata[roomID]['state'] = game_state.closed;
        requestHTTP.post('http://212.47.232.223/rest/update_match_result', {
            form: {
                roomID: roomID,
                user1ID: room_metadata[roomID]['users'][0],
                user2ID: room_metadata[roomID]['users'][1],
                winner: score['winner'],
                user1Score: score['user1'],
                user2Score: score['user2'],
                turn: room_metadata[roomID]['turn_count']
            }
        }, function (error, response, res_body) {

            if (!error && response.statusCode == 200) {
                var x = JSON.parse(res_body);
                var user1 = (x['user1']);
                var user2 = (x['user2']);
                var _roomID = parseInt(x['roomID'], 10);
                room_metadata[_roomID]['state'] = game_state.closed;
                var room = room_active_users[_roomID];
                if (room != undefined) {
                    for (var i = 0; i < room.length; i++) {
                        var _uid = room[i];
                        const buf = Buffer.allocUnsafe(36);
                        buf.writeUInt32LE(_uid, 0);
                        buf.writeUInt32LE(_roomID, 4);
                        buf.writeUInt32LE(127, 8);
                        buf.writeUInt32LE(12, 12);
                        buf.writeUInt32LE(0, 16);
                        buf.writeUInt32LE(0, 20);

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
                        }
                    }
                    room_metadata[_roomID]['log_file_ws'].end();
                    //delete room_metadata[roomID]['match_state'];
                    fs.writeFile('./log/ForceFinish/' + new Date().toISOString() + '_room#' + roomID + '.log', userID);
                }

            }
            //TODO: add match result to room metadata :D
        });


    }catch(e){
        console.log(chalkError("exception in finishFragilePlay : "+ e));
    }
}
function init_room_metadata(roomID){
    if (room_active_users[roomID] == undefined || room_metadata[roomID] == undefined) {
        room_active_users[roomID] = [];
        room_metadata[roomID] = {};
        room_metadata[roomID]['state'] = game_state.wait;
        room_metadata[roomID]['match_state'] = {};
        room_metadata[roomID]['turn_count'] = 0;
        room_metadata[roomID]['last_state'] = -1;
        room_metadata[roomID]['log_file_ws'] = fs.createWriteStream( log_file_nameGen(roomID),{ flags: "w+", defaultEncoding: null, autoClose: true } );
        room_metadata[roomID]['log_file_err'] = err_file_nameGen(roomID);
        room_metadata[roomID]['init_timeout_obj'] = setTimeout(closeRoomOnFinish, init_wait_time, roomID);
        room_metadata[roomID]['init_time'] = new Date().getTime();
        room_metadata[roomID]['close_time'] = -1;
        room_metadata[roomID]['users'] = [];
        room_metadata[roomID]['turn_index'] = -1;

    }
}

function closeRoomOnFinish(roomID){

    room_metadata[roomID]['state'] = game_state.closed;
    room_metadata[roomID]['log_file_ws'].end();
    //delete room_metadata[roomID]['match_state'];
    room_metadata[roomID]['close_time'] = new Date().getTime();
    disconnectAll(roomID);
    //clear all timeouts


}

function log_file_nameGen(roomID){
    return './log/room_' + roomID + '_' + new Date().toISOString() + '.log';
}

function err_file_nameGen(roomID){
    return './log/error/room_' + roomID + '_' + new Date().toISOString();
}

function disconnectAll(roomID) {
    try {
        const buf = Buffer.allocUnsafe(24);
        buf.writeUInt32LE(0, 0);
        buf.writeUInt32LE(roomID, 4);
        buf.writeUInt32LE(126, 8);
        buf.writeUInt32LE(0, 12);
        buf.writeUInt32LE(0, 16);
        buf.writeUInt32LE(0, 20);
        for (var i = 0; i < room_metadata[roomID]['users'].length; i++) {
            try {
                clients_connection[room[i]].sendBytes(buf, function (err) {
                    if (err) {
                        logger(chalkDate(new Date()) + ' ->\n\t' + 'DC all err ' + chalkError(err));
                    } else {
                    }
                });
            } catch (e) {
                logger(chalkError('DC exception message to  exception : ' + e));
            }
        }
    }catch(e){
        console.log(chalkError("exception in disconnectAll : "+ e));
    }
}