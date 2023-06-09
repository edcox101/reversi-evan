/********************/
/*Set up the static file server*/
let static = require('node-static');

/* set up http server*/
let http = require('http');

/*assume running on heroku*/
let port = process.env.PORT;
let directory = __dirname + '/public';

/* if we are not on heroku then need to adjust port and directory */
if ((typeof port === 'undefined') || (port === null)) {
  port = 8080;
  directory = './public';
}

/*set up our sttic file web server to deliver files from the filesystem */
let file = new static.Server(directory);

let app = http.createServer(
  function (request, response) {
    request.addListener('end',
      function () {
        file.serve(request, response);
      }
    ).resume();
  }
).listen(port);

console.log('The server is running');

/*Set up the web socket server*/

/*Set up registry of player information and their socket ids*/
let players = [];

const { Server } = require("socket.io");
const io = new Server(app);

io.on('connection', (socket) => {

  /* output log message on server and send it to the clients */
  function serverLog(...messages) {
    io.emit('log', ['**** Message from the server:\n']);
    messages.forEach((item) => {
      io.emit('log', ['****\t' + item]);
      console.log(item);
    });
  }

  serverLog('a page connected to the server: ' + socket.id);


  /*join_room command handler */
  /*expected payload:
     {
         'room': the room to be joined,
         'username': the name of the user joining the room
     }
    */
  /* join_room_response: 
      {
        'result': 'success',
        'room': room that was joined,
        'username': the user that joined the room,
        'count': the number of users in the chat room
        'socket_id": the socket of the user that just joined the room
      }
  or
      {
        'result': 'fail',
        'message': the reason for failure,
      }
  */

  socket.on('join_room', (payload) => {
    serverLog('Server received a command', '\'join_room\'', JSON.stringify(payload));
    /*Check that the data coming from the client is good */
    if ((typeof payload == 'undefinded') || (payload === null)) {
      response = {};
      response.result = 'fail'
      response.message = 'client did not send a payload';
      socket.emit('join_room_response', response);
      serverLog('join_room command failed', JSON.stringify(response));
      return;
    }
    let room = payload.room;
    let username = payload.username;
    if ((typeof room == 'undefinded') || (room === null)) {
      response = {};
      response.result = 'fail'
      response.message = 'client did not send a valid room to join';
      socket.emit('join_room_response', response);
      serverLog('join_room command failed', JSON.stringify(response));
      return;
    }
    if ((typeof username == 'undefinded') || (username === null)) {
      response = {};
      response.result = 'fail'
      response.message = 'client did not send a valid username to join chat room';
      socket.emit('join_room_response', response);
      serverLog('join_room command failed', JSON.stringify(response));
      return;
    }

    /*Handle the command */
    socket.join(room);

    /*Make sure the client was put in the room */
    io.in(room).fetchSockets().then((sockets) => {
      /*Socket didn't join the room */
      if ((typeof sockets == 'undefinded') || (sockets === null) || !sockets.includes(socket)) {
        response = {};
        response.result = 'fail';
        response.message = 'Server internal error joining chat room';
        socket.emit('join_room_response', response);
        serverLog('join_room command failed', JSON.stringify(response));
      }
      /*Socket did join room */
      else {
        players[socket.id] = {
          username: username,
          room: room
        }
        /*Announce to everyone in room who else in room*/
        for (const member of sockets) {
          let room = players[member.id].room;
          response = {
            result: 'success',
            socket_id: member.id,
            room: players[member.id].room,
            username: players[member.id].username,
            count: sockets.length
          }
          /*Tell everyone that a new user has joined the chat room */
          io.of('/').to(room).emit('join_room_response', response);
          serverLog('join_room succeeded ', JSON.stringify(response));
          if (room !== "Lobby") {
            send_game_update(socket, room, 'initial update');
          }
        }
      }
    });
  });

  socket.on('invite', (payload) => {
    serverLog('Server received a command', '\'invite\'', JSON.stringify(payload));
    /*Check that the data coming from the client is good */
    if ((typeof payload == 'undefinded') || (payload === null)) {
      response = {};
      response.result = 'fail'
      response.message = 'client did not send a payload';
      socket.emit('invite_response', response);
      serverLog('invite command failed', JSON.stringify(response));
      return;
    }
    let requested_user = payload.requested_user;
    let room = players[socket.id].room;
    let username = players[socket.id].username;
    if ((typeof requested_user == 'undefinded') || (requested_user === null) || (requested_user === "")) {
      response = {
        result: 'fail',
        message: 'client did not send a valid user to invite to play'
      }
      socket.emit('invite_response', response);
      serverLog('invite command failed', JSON.stringify(response));
      return;
    }


    if ((typeof room == 'undefinded') || (room === null)) {
      response = {
        result: 'fail',
        message: 'the user that was inivited is not in a room'
      }
      socket.emit('invite_response', response);
      serverLog('invite command failed', JSON.stringify(response));
      return;
    }
    if ((typeof username == 'undefinded') || (username === null) || (username === "")) {
      response = {
        result: 'fail',
        message: 'the user that was inivited does not have a name registered'
      }
      socket.emit('invite_response', response);
      serverLog('invite command failed', JSON.stringify(response));
      return;
    }

    /*Make sure the invited player is present */
    io.in(room).allSockets().then((sockets) => {
      /*Invite isn't in the room */
      if ((typeof sockets == 'undefinded') || (sockets === null) || !sockets.has(requested_user)) {
        response = {
          result: 'fail',
          message: 'the user that was inivited is no longer in the room'
        }
        socket.emit('invite_response', response);
        serverLog('invite command failed', JSON.stringify(response));
        return;
      }
      /*Invitee is in the room */
      else {
        response = {
          result: 'success',
          socket_id: requested_user
        }
        socket.emit("invite_response", response);
        response = {
          result: 'success',
          socket_id: socket.id
        }
        socket.to(requested_user).emit("invited", response);
        serverLog('invite command succeeded', JSON.stringify(response));

      }
    });
  });

  socket.on('uninvite', (payload) => {
    serverLog('Server received a command', '\'uninvite\'', JSON.stringify(payload));
    /*Check that the data coming from the client is good */
    if ((typeof payload == 'undefinded') || (payload === null)) {
      response = {};
      response.result = 'fail'
      response.message = 'client did not send a payload';
      socket.emit('uninvited', response);
      serverLog('uninvite command failed', JSON.stringify(response));
      return;
    }
    let requested_user = payload.requested_user;
    let room = players[socket.id].room;
    let username = players[socket.id].username;
    if ((typeof requested_user == 'undefinded') || (requested_user === null) || (requested_user === "")) {
      response = {
        result: 'fail',
        message: 'client did not send a valid user to uninvite to play'
      }
      socket.emit('uninvited', response);
      serverLog('uninvite command failed', JSON.stringify(response));
      return;
    }


    if ((typeof room == 'undefinded') || (room === null)) {
      response = {
        result: 'fail',
        message: 'the user that was uninivited is not in a room'
      }
      socket.emit('uninvited', response);
      serverLog('uninvited command failed', JSON.stringify(response));
      return;
    }
    if ((typeof username == 'undefinded') || (username === null) || (username === "")) {
      response = {
        result: 'fail',
        message: 'the user that was uninivited does not have a name registered'
      }
      socket.emit('uninvited', response);
      serverLog('uninvite command failed', JSON.stringify(response));
      return;
    }

    /*Make sure the invited player is present */
    io.in(room).allSockets().then((sockets) => {
      /*Uninvitee isn't in the room */
      if ((typeof sockets == 'undefinded') || (sockets === null) || !sockets.has(requested_user)) {
        response = {
          result: 'fail',
          message: 'the user that was uninivited is no longer in the room'
        }
        socket.emit('uninvited', response);
        serverLog('uninvite command failed', JSON.stringify(response));
        return;
      }
      /*Invitee is in the room */
      else {
        response = {
          result: 'success',
          socket_id: requested_user
        }
        socket.emit("uninvited", response);
        response = {
          result: 'success',
          socket_id: socket.id
        }
        socket.to(requested_user).emit("uninvited", response);
        serverLog('uninvite command succeeded', JSON.stringify(response));

      }
    });
  });

  socket.on('game_start', (payload) => {
    serverLog('Server received a command', '\'game_start\'', JSON.stringify(payload));
    /*Check that the data coming from the client is good */
    if ((typeof payload == 'undefined') || (payload === null)) {
      response = {};
      response.result = 'fail'
      response.message = 'client did not send a payload';
      socket.emit('game_start_response', response);
      serverLog('game_start command failed', JSON.stringify(response));
      return;
    }
    let requested_user = payload.requested_user;
    let room = players[socket.id].room;
    let username = players[socket.id].username;
    if ((typeof requested_user == 'undefined') || (requested_user === null) || (requested_user === "")) {
      response = {
        result: 'fail',
        message: 'client did not request a valid user to engage in play'
      }
      socket.emit('game_start_response', response);
      serverLog('game_start command failed', JSON.stringify(response));
      return;
    }


    if ((typeof room == 'undefinded') || (room === null)) {
      response = {
        result: 'fail',
        message: 'the user that was engaged to play is not in a room'
      }
      socket.emit('game_start_response', response);
      serverLog('game_start command failed', JSON.stringify(response));
      return;
    }
    if ((typeof username == 'undefinded') || (username === null) || (username === "")) {
      response = {
        result: 'fail',
        message: 'the user that was engaged to play does not have a name registered'
      }
      socket.emit('game_start_response', response);
      serverLog('game_start command failed', JSON.stringify(response));
      return;
    }

    /*Make sure the player to engage is present */
    io.in(room).allSockets().then((sockets) => {
      /*Engaged player isn't in the room */
      if ((typeof sockets == 'undefined') || (sockets === null) || !sockets.has(requested_user)) {
        response = {
          result: 'fail',
          message: 'the user that was engaged to play is no longer in the room'
        }
        socket.emit('game_start_response', response);
        serverLog('game_start command failed', JSON.stringify(response));
        return;
      }
      /*Engaged player is in the room */
      else {
        let game_id = Math.floor(1 + Math.random() * 0x100000).toString(16);
        response = {
          result: 'success',
          game_id: game_id,
          socket_id: requested_user
        }
        socket.emit("game_start_response", response);
        socket.to(requested_user).emit("game_start_response", response);
        serverLog('game_start command succeeded', JSON.stringify(response));

      }
    });
  });

  socket.on('disconnect', () => {
    serverLog('a page disconnected from the server: ' + socket.id);
    if ((typeof players[socket.id] != 'undefined') && (players[socket.id] != null)) {
      let payload = {
        usrname: players[socket.id].username,
        room: players[socket.id].room,
        count: Object.keys(players).length - 1,
        socket_id: socket.id
      };
      let room = players[socket.id].room;
      delete players[socket.id];
      /* Tell everyone who left the room */
      io.of("/").to(room).emit('player_disconnected', payload);
      serverLog('player_disconnected succeeded ', JSON.stringify(payload));
    }
  });

  /*send_chat_message command handler */
  /*expected payload:
    {
        'room': the room to which the message should be sent,
        'username': the name of the sender,
        'message': the message to broadcast
    }
   */
  /* send_chat_message_response: 
      {
        'result': 'success',
        'username': the user that sent the message,
        'message': the message that was sent
      }
  or
      {
        'result': 'fail',
        'message': the reason for failure
      } */

  socket.on('send_chat_message', (payload) => {
    serverLog('Server received a command', '\'send_chat_message\'', JSON.stringify(payload));
    /*Check that the data coming from the client is good */
    if ((typeof payload == 'undefinded') || (payload === null)) {
      response = {};
      response.result = 'fail'
      response.message = 'client did not send a payload';
      socket.emit('send_chat_message_response', response);
      serverLog('send_chat_message command failed', JSON.stringify(response));
      return;
    }
    let room = payload.room;
    let username = payload.username;
    let message = payload.message;
    if ((typeof room == 'undefinded') || (room === null)) {
      response = {};
      response.result = 'fail'
      response.message = 'client did not send a valid room to message';
      socket.emit('send_chat_message_response', response);
      serverLog('send_chat_message command failed', JSON.stringify(response));
      return;
    }
    if ((typeof username == 'undefinded') || (username === null)) {
      response = {};
      response.result = 'fail'
      response.message = 'client did not send a valid username as a message source';
      socket.emit('send_chat_message_response', response);
      serverLog('send_chat_message command failed', JSON.stringify(response));
      return;
    }
    if ((typeof message == 'undefinded') || (message === null)) {
      response = {};
      response.result = 'fail'
      response.message = 'client did not send a valid message';
      socket.emit('send_chat_message_response', response);
      serverLog('send_chat_message command failed', JSON.stringify(response));
      return;
    }

    /*Handle the command */
    let response = {};
    response.result = 'success';
    response.username = username;
    response.room = room;
    response.message = message;
    /* Tell everyone in the room what the message is */
    io.of('/').to(room).emit('send_chat_message_response', response);
    serverLog('send_chat_message command succeeded', JSON.stringify(response));
  });

  socket.on('play_token', (payload) => {
    serverLog('Server received a command', '\'play_token\'', JSON.stringify(payload));
    /*Check that the data coming from the client is good */
    if ((typeof payload == 'undefinded') || (payload === null)) {
      response = {};
      response.result = 'fail'
      response.message = 'client did not send a payload';
      socket.emit('play_token_response', response);
      serverLog('play_token command failed', JSON.stringify(response));
      return;
    }
    let player = players[socket.id];
    if ((typeof player == 'undefinded') || (player === null)) {
      response = {};
      response.result = 'fail'
      response.message = 'play_token came from an unregistered player';
      socket.emit('play_token_response', response);
      serverLog('play_token command failed', JSON.stringify(response));
      return;
    }

    let username = player.username;
    if ((typeof username == 'undefinded') || (username === null)) {
      response = {};
      response.result = 'fail'
      response.message = 'play_token command did not come from a registered username';
      socket.emit('play_token_response', response);
      serverLog('play_token command failed', JSON.stringify(response));
      return;
    }

    let game_id = player.room;
    if ((typeof game_id == 'undefinded') || (game_id === null)) {
      response = {};
      response.result = 'fail'
      response.message = 'There was no valid game associated with the play_token command';
      socket.emit('play_token_response', response);
      serverLog('play_token command failed', JSON.stringify(response));
      return;
    }

    let row = payload.row;
    if ((typeof row == 'undefinded') || (row === null)) {
      response = {};
      response.result = 'fail'
      response.message = 'There was no valid row associated with the play_token command';
      socket.emit('play_token_response', response);
      serverLog('play_token command failed', JSON.stringify(response));
      return;
    }
    let column = payload.column;
    if ((typeof column == 'undefinded') || (column === null)) {
      response = {};
      response.result = 'fail'
      response.message = 'There was no valid column associated with the play_token command';
      socket.emit('play_token_response', response);
      serverLog('play_token command failed', JSON.stringify(response));
      return;
    }

    let color = payload.color;
    if ((typeof color == 'undefinded') || (color === null)) {
      response = {};
      response.result = 'fail'
      response.message = 'There was no valid color associated with the play_token command';
      socket.emit('play_token_response', response);
      serverLog('play_token command failed', JSON.stringify(response));
      return;
    }

    let game = games[game_id];
    if ((typeof game == 'undefinded') || (game === null)) {
      response = {};
      response.result = 'fail'
      response.message = 'There was no valid game associated with the play_token command';
      socket.emit('play_token_response', response);
      serverLog('play_token command failed', JSON.stringify(response));
      return;
    }

    let response = {
      result: 'success'
    }
    socket.emit('play_token_response', response);

    /* Execute the move*/
    if (color === 'white') {
      game.board[row][column] = 'w';
      game.whose_turn = 'black';
    }
    else if (color === 'black') {
      game.board[row][column] = 'b';
      game.whose_turn = 'white';
    }

    send_game_update(socket, game_id, 'played a token');
  });
});


/*Code related to game state */

let games = [];

function create_new_game() {
  let new_game = {};
  new_game.player_white = {};
  new_game.player_white.socket = "";
  new_game.player_white.username = "";
  new_game.player_black = {};
  new_game.player_black.socket = "";
  new_game.player_black.username = "";

  var d = new Date();
  new_game.last_move_time = d.getTime();

  new_game.whose_turn = 'black';

  new_game.board = [
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
    [' ', ' ', ' ', 'w', 'b', ' ', ' ', ' '],
    [' ', ' ', ' ', 'b', 'w', ' ', ' ', ' '],
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
    [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ']
  ];
  
  
  return new_game;

}

function send_game_update(socket, game_id, message) {
  /* send game update */

  /*check to see if a game with game_id exists */
  if ((typeof games[game_id] == 'undefined') || (games[game_id] === null)) {
    console.log("No game exists with game_id:" + game_id + ". Making a new game for " + socket.id);
    games[game_id] = create_new_game();
  }

  /*make sure only 2 people in room */
  /* assign this socket a color */
  io.of('/').to(game_id).allSockets().then((sockets) => {

    const iterator = sockets[Symbol.iterator]();
    if (sockets.size >= 1) {
      let first = iterator.next().value;
      if ((games[game_id].player_white.socket != first) &&
        (games[game_id].player_black.socket != first)) {
        /* Player does not have a color */
        if (games[game_id].player_white.socket === "") {
          /* This play should be white */
          console.log("White is assigned to: " + first);
          games[game_id].player_white.socket = first;
          games[game_id].player_white.username = players[first].username;
        }

        else if (games[game_id].player_black.socket === "") {
          /* This play should be black */
          console.log("Black is assigned to: " + first);
          games[game_id].player_black.socket = first;
          games[game_id].player_black.username = players[first].username;
        }
        else {
          /* This player should be kicked out */
          console.log("Kicking " + first + " out of game: " + game_id);
          io.in(first).socketsLeave([game_id]);
        }
      }
    }

    if (sockets.size >= 2) {
      let second = iterator.next().value;
      if ((games[game_id].player_white.socket != second) &&
        (games[game_id].player_black.socket != second)) {
        /* Player does not have a color */
        if (games[game_id].player_white.socket === "") {
          /* This play should be white */
          console.log("White is assigned to: " + second);
          games[game_id].player_white.socket = second;
          games[game_id].player_white.username = players[second].username;
        }

        else if (games[game_id].player_black.socket === "") {
          /* This play should be black */
          console.log("Black is assigned to: " + second);
          games[game_id].player_black.socket = second;
          games[game_id].player_black.username = players[second].username;
        }
        else {
          /* This player should be kicked out */
          console.log("Kicking " + second + " out of game: " + game_id);
          io.in(second).socketsLeave([game_id]);
        }
      }
    }
    /* send game update */
    let payload = {
      result: 'success',
      game_id: game_id,
      game: games[game_id],
      message: message
    }
    io.of("/").to(game_id).emit('game_update', payload);

    /* check if the game is over */
    let count = 0;
    for (let row = 0; row < 8; row++) {
      for (let column = 0; column < 8; column++) {
        if (games[game_id].board[row][column] != ' ') {
          count++;
        }
      }
    }
    if (count === 64) {
      let payload = {
        result: 'success',
        game_id: game_id,
        game: games[game_id],
        who_won: 'everyone'
      }
      io.in(game_id).emit('game_over', payload);
    
      /* Delete old games after one hour */
      setTimeout(
        ((id) => {
          return (() => {
            delete games[id];
          });
        })(game_id)
        , 60 * 60 * 1000
      );
    }

  });
}
