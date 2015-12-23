var io = require("io"); // Note socket.io is added globally in the html page
var d3 = require("d3/d3.min.js");

require("./style.css");


console.log("Welcome to spacerace");

var mapScale = 1.0;
var SHIPSIZE;
var socket = io();
var requestID;
var gameState;  // Object linking playerID: state objects
var lastUpdateTime;
var nextMap = false;

var updates = 0;
var draws = 0;
var fpsqueue = [];
var playerNames = [];  // Player ID array
var playerColors = {}; // map from PlayerID to a color

var playerDiv = d3.select("#leaderboard");
var playerContainer = playerDiv.append("ol");

function checkStarted(data){
    if(nextMap === false){
        // First time, load a map
        nextMap = data.map;
        loadMap();
    }
    nextMap = data.map;
}

socket.on('Log', function (msg) {
    var rawPacket = JSON.parse(msg);
    //console.log(rawPacket);

    if(rawPacket.category === "lobby"){
        console.log("Lobby Message received");
        console.log(rawPacket);

        if (rawPacket.subject === "status"){
            checkStarted(rawPacket.data);
            nextMap = rawPacket.data.map;

            d3.selectAll("#lobby ul").remove();

            var lobby = d3.selectAll("#lobby")
                .append("ul")
                .selectAll("#lobby li")
                .data(rawPacket.data.players);

            lobby.enter()
                .append("li")
                .text(function(d, i){ return d; });
        }

        return;
    }

    if (rawPacket.category === "game") {

        // General Game updates
        if (rawPacket.subject === "status"){
            var d = rawPacket.data;

            //console.log(d);
            d3.select("#statusMessage").text(d.game + ' on ' + d.map + ' is ' + d.state);

            if(d.state === 'queued') {
                console.log("Ignoring message for queued game");
                console.log(d);
            }

            if (d.state === 'finished') {
                console.log("Updating score board");
                console.log(d);


                // Show who won. Note d.ranking has the final order
                var winner;
                // Note we want to show points for everyone who has played in the
                // tournament - not just this game
                var tournamentPlayers = d3.keys(d.teamScore);
                var tournamentPoints = tournamentPlayers.map(function(playerName) {
                    if (d.ranking[playerName] == 0){
                        winner = playerName;
                    }

                    return {
                        "name" : playerName,
                        "score" : d.totalScore[playerName]
                    };
                });

                console.log("Tournament points:");
                console.log(tournamentPoints);

                d3.select("#statusMessage").text(
                    d.game + ' on map ' + d.map + ' was won by ' + winner);

                var teamScore = d3.select("#GlobalLeaderboard")
                    .selectAll("li")
                    .data(tournamentPoints);


                teamScore.exit().remove();
                teamScore.enter().append("li").text(function(d, i){
                    return d.name + " - " + d.score;
                });

                teamScore.on("click", function(d, i){
                    console.log("Selecting team " + d.name);
                    console.log(d);

                    // TODO select all of a team

                })
            }

            if (d.state === 'running') {
                // Update the players rankings
                // d.ranking is a map of player ID -> score

                var players = d3.selectAll(".playerIndivdualScore");

                // Note ranking will always be here
                players.sort(function(p1, p2) {
                    //return p1.id - p2.id; // Sort by name for now
                    return parseFloat(d.ranking[p1]) - parseFloat(d.ranking[p2]);
                })
                .transition().duration(5);

                updateCurrentGameScoreBoard(d.ranking);

                // Show time remaining
                timeRemaining.text(d.time_remaining);

            }
        } else {
            console.log("unknown subject");
        }

    }
    else {
        console.log("Log socket received unknown category");
        console.log(rawPacket);
    }
});


socket.on('GameState', function (msg) {
    var rawPacket = JSON.parse(msg);

    if (rawPacket.state === "running") {
        gameState = rawPacket.data;
        updates += 1;

        if (updates == 1) {
            // Note loadMap will reset updates to 0 if the map isn't
            // yet available.
            loadMap(setupGame);
        }
    }

    if (rawPacket.state === "finished") {
        console.log("Game Over");
        updates = 0;
        draws = 0;
        cancelAnimationFrame(requestID);

        // TODO: Update the global score board
        // Note current rawPacket doesn't have useful data for this
    }
});


var svgContainer = d3.select('#game')
    .attr("width", "100%")
    .attr("height", "500");

var mapContainer = svgContainer.append("g");

var shipG = svgContainer.append("defs")
    .append("g")
    .attr("id", "ship")
    .attr("class", "ship");

shipG.append("polygon")
    .attr("points", "0,-23 22,12 -22,12")
    .attr("class", "shipWings");

// For now the jet "backwards" is simply a solid line
shipG.append("line")
    .attr("class", "shipJet")
    .attr("x1", 0)
    .attr("y1", 10)
    .attr("x2", 0)
    .attr("y2", 20);

// Main circular body of the ship
shipG.append("circle")
    .attr("class", "shipBody")
    .attr('cx', 0)
    .attr('cy', 0)
    .attr('r', function (d, i) {
        return 16;
    });


shipG.append("polygon")
    .attr("points", "-2,5 2,5 0,-20")
    .attr("class", "shipStripe");


var shipGroup = svgContainer.append("g").attr("id", "shipsParentGroup");

var ships;

var x, y;

var mapWidth, mapHeight;

function loadMap(cb) {

    if(!nextMap){
        console.debug("Not setting up game as we don't know what map to load");
        updates = 0;
        return;
    }

    function imageExists(image_url){
        var http = new XMLHttpRequest();
        http.open('HEAD', image_url, false);
        http.send();
        return http.status != 404;
    }

    var baseUrl = "../maps/" + nextMap;
    var mapData = imageExists(baseUrl + "_skin.png") ? baseUrl + "_skin.png" : baseUrl + ".png";

    var mapImage = document.createElement('img');
    mapImage.addEventListener('load', function () {
        /*
         * Find out the real size/aspect ratio of the
         * image so we draw our ships correctly
         * */
        mapWidth = mapImage.width;
        mapHeight = mapImage.height;
        var aspectRatio = mapWidth / mapHeight;

        console.log("Loaded map image. Size = (%s, %s)", mapWidth, mapHeight);

        // Set the game's height to match the map's aspect ratio?
        var displayWidth = parseInt(svgContainer.style("width"), 10);
        var displayHeight = displayWidth / aspectRatio;

        console.log("Display size = (%s, %s)", displayWidth, displayHeight);

        svgContainer
            .attr("height", displayHeight)
            .attr('width', displayWidth);

        // Add an <image> to our <svg>
        // TODO test performance of putting it in a div behind the svg?
        mapContainer.selectAll("image").remove();
        mapContainer.append("image")
            .attr("id", "GameMap")
            .attr("width", displayWidth)
            .attr("height", displayHeight)
            .attr("xlink:href", mapData);


        /* Set up mappings between image pixels, game units, and display pixels
         * mapScale is approx 10.
         * If a map is 1500px wide, the physics engine will give positions between [0,150]
         * (0,0) is at the bottom left
         * */

        x = d3.scale.linear().domain([0, mapWidth / mapScale]).range([0, displayWidth]);
        y = d3.scale.linear().domain([0, mapHeight / mapScale]).range([displayHeight, 0]);

        if(cb){
            cb();
        }
    });

    mapImage.src = mapData;
}

var selectedShip;

var fps = d3.select("#fps span");
var timeRemaining = d3.select("#timeRemaining span");

var updateCurrentGameScoreBoard = function(ranking) {

    var playerIDs = d3.keys(gameState);

    var players = playerContainer.selectAll(".playerIndivdualScore")
        .data(playerIDs);

    players.exit().remove();

    var d = players
        .enter()
        .append("li")
        .attr("class", "playerIndivdualScore")
        .on("click", function(d, i){
            console.log("Selecting ship for player " + d);
            selectedShip = i;
        });

    d
        .attr("title", function(d){return d;})
        .style("color", function(d, i){
            return playerColors[d];
        });


    d.append("span")
        .attr("class", "playerName")
        .text(function(d, i){
            return d;
        });

    var rank = d.append("strong")
        .attr('class', 'score')
        .attr("title", "Player's rank");


};

// Runs once per game
var setupGame = function () {

    var initState = gameState;
    selectedShip = null;
    // Note: The ship is rendered as 2 * mapScale wide in game units (radius of the ship = 1 map scale)
    // Ship size in display pixels
    SHIPSIZE = x(10)/16;

    console.log("Ship size will be " + SHIPSIZE);

    for (var playerID in initState) {
        if(playerColors.hasOwnProperty(playerID)){
            // This player already has a color
        } else {
            playerColors[playerID] = "hsl(" + Math.random() * 360 + ",75%, 50%)";
        }
    }

    // Show each player
    console.log(initState);
    playerNames = d3.keys(initState);
    console.log(playerNames);

    updateCurrentGameScoreBoard();

    ships = shipGroup
        .selectAll('.ship')
        .data(playerNames);

    ships.exit().remove();

    ships
        .enter()
        .append('use')
        .attr("class", "ship")
        .attr("id", function (d, i) {
            return "ship" + i;
        })
        .attr("xlink:href", "#ship")

        .attr('fill', function (d) {
            return playerColors[d];
        });

    // Trigger the first full draw
    updateState();

};

var updateState = function (highResTimestamp) {
    requestID = requestAnimationFrame(updateState);

    if (updates >= draws) {
        //if(updates % 60*5 == 0){
        //    console.log(gameState.map(function(s){return "(" + s.x + ',' + s.y + ")";}).join(' '));
        //}
        // Only update the ships if we have gotten an update from the server
        draws += 1;

        // Calculate an fps counter
        if (fpsqueue.length >= 100) {
            fps.text(d3.mean(fpsqueue).toFixed(0));
            fpsqueue = fpsqueue.slice(1, 100);
        }
        fpsqueue.push(Math.round(1000 / (highResTimestamp - lastUpdateTime)));
        lastUpdateTime = highResTimestamp;

        ships
            .style("fill", function(d, i){
                if(selectedShip === i){
                    return "black";
                }
            })
            // Perhaps we can add/remove the jet with display="none"
            //.attr("x", function (d, i) {
            //    return x(d.x);
            //})
            //.attr("y", function (d, i) {
            //    return y(d.y);
            //})
            .attr("transform", function (playerID, i) {
                var d = gameState[playerID];
                // Note SVG rotate takes degrees not radians, and it also takes position (X, Y)
                // to center the rotation around.
                // scale(0.5, 0.5) translate(200, 0) rotate(45)
                var shipHeadingRads = d.theta;

                return "translate(" + (x(d.x)) + ", " + (y(d.y)) + ")" +
                    "scale(" + SHIPSIZE + ", " + SHIPSIZE + ") " +
                    " rotate(" + (90 - shipHeadingRads * 360 / (2 * Math.PI)) + ")"
                    ;
            });
    }
};



