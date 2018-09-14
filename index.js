'use strict';
var CryptoJS = require("crypto-js");
var express = require("express");
var bodyParser = require('body-parser');
var WebSocket = require("ws");
var fs = require('fs');
var https = require('https');
var path = require('path');

var key_   = fs.readFileSync('/root/ssl/p.key', 'utf8');
var cert_  = fs.readFileSync('/root/ssl/s.cert', 'utf8');

var http_port = process.env.HTTP_PORT || 80;//3000;
var ws_port = process.env.WS_PORT || 3000;

var server_wss_secure = https.createServer({key: key_, cert: cert_}, express);
server_wss_secure.listen(ws_port, function(){
    console.log('Listening wss connection on *: '+ws_port);
});

initBlockchain();

var io = require('socket.io')(server_wss_secure);
io.on('connection', function(socket){
    console.log('user connected');

    io.emit('raw_blockchain_data', raw_blockchain_data);
    socket.on('disconnect', function(){
        console.log('user disconnected');
    });
});

io.on('connection', function(socket){
    socket.on('new_block_message', function( obj_){
        console.log(obj_.user + " " + obj_.value);
        var res = tryAddNewBlockToBlockchain( obj_);
        console.log("block was added to blockchain: " + res);
    });

    socket.on('blockchain_manual_update_message', function( obj_){
        
       
        console.log(obj_.blockchain_data);
        var data1 = obj_.blockchain_data;
        if (isJsonStringValid( data1) ) {
            writeBlockchainToFile( data1);
            io.emit('on_manual_update',true);
        }
        else {
            io.emit('on_manual_update',false);
        }
    });
});

class Block {
    constructor(index, previousHash, timestamp, data, hash) {
        this.index = index;//genesis block index is: 1
        this.previousHash = previousHash.toString();
        this.timestamp = timestamp;
        this.data = data;
        this.hash = hash.toString();
    }
}

var getGenesisBlock = () => {
    var txt_data = '{"user":"MobiDev", "value":"Rocks!"}';
    var genesisData = JSON.parse(txt_data);
    return new Block(1, "0", 1254862800, genesisData, "1ec2ca6dbd0e94c33e2e731c8db34162055d45eea3a5f10349b0d9ad5a616857");
};

// var blockchain = [getGenesisBlock()];
var blockchain = [];
var raw_blockchain_data;

var initHttpServer = () => {
    var app = express();
    app.use(bodyParser.json());

    app.get('/blocks', (req, res) => { 

        res.send(JSON.stringify(blockchain)); 
    });
    app.post('/addNewBlock', (req, res) => {
        var newBlockData = req.body.data;
        tryAddNewBlockToBlockchain(newBlockData);

        console.log('block added: ' + JSON.stringify(newBlock));
        res.send();
    });


    app.get('/validateblocks', (req, res) => {
        var validation_result = validateAllBlocksInChain();
        if (validation_result) {console.log("Validation is success");res.send("<b>Validation result is: Success</b>");}
        else {console.log("Validation is failed");res.send("<b>I can not validate Blockchain</b>");}
    });

    
    app.use('/assets', express.static(path.join(__dirname, 'assets')));
    app.get('/', function(req, res) {
      res.sendFile(__dirname + '/index.html');
    });

    app.listen(http_port, () => console.log('Listening http on port *: ' + http_port));
};

var generateNextBlock = (blockData) => {
    var prevBlock = getLatestBlock();
    var nextIndex = prevBlock.index + 1;
    var nextTimestamp = Math.round(new Date().getTime() / 1000);
    var newBlockHash = calculateHashOfData(nextIndex, prevBlock.hash, nextTimestamp, blockData);

    return new Block(nextIndex, prevBlock.hash, nextTimestamp, blockData, newBlockHash);
};


var calculateHashForBlock = (block) => {
    return calculateHashOfData(block.index, block.previousHash, block.timestamp, block.data);
};

var calculateHashOfData = (index, prevHash, timestamp, data) => {
    return CryptoJS.SHA256(index + prevHash + timestamp + data).toString();
};

function addBlockToChain(blockData_) {
    var newBlockForChain = generateNextBlock(blockData_);
    if (isBlockValid(newBlockForChain, getLatestBlock())) {
        blockchain.push(newBlockForChain);
        return true;
    }
    else return false;
};

function isBlockValid (currentBlock, previousBlock) {
    if (previousBlock.index + 1 !== currentBlock.index) {
        console.log('error: invalid index');
        return false;
    } else if (previousBlock.hash !== currentBlock.previousHash) {
        console.log('error: invalid prevHash');
        return false;
    } else if (calculateHashForBlock(currentBlock) !== currentBlock.hash) {
        console.log(typeof (currentBlock.hash) + ' ' + typeof calculateHashForBlock(currentBlock));
        console.log('error: invalid hash: ' + calculateHashForBlock(currentBlock) + ' ' + currentBlock.hash);
        return false;
    }
    return true;
};

function getLatestBlock() {
    return blockchain[blockchain.length-1];
};

function initBlockchain() {
    readBlockchainFromFile();
}

initHttpServer();

function tryAddNewBlockToBlockchain(blockdata_) {
    //blockdata_ is JSON object with keys: user | value

    if (addBlockToChain(blockdata_)) {
        //in case new block is valid we can go forward
        writeBlockchainToFile(JSON.stringify(blockchain));//callback of method updates [blockchain] variable
        return true;
    }
    return false;
}

function validateAllBlocksInChain() {
    var res = true;
    console.log( JSON.stringify( blockchain[0] ));
    if (blockchain.length == 1) {return true;}
    for (var i=1; i<blockchain.length; i++) {//we starts from index 1 in order to satisfy condition [current | previous]
        console.log( JSON.stringify( blockchain[i] ));
        res = isBlockValid(blockchain[i], blockchain[i-1] );//compare curr with prev
        if (!res) 
            break;
    }
    return res;
};

function writeBlockchainToFile(blockchain_data) {
    var file_path = "/var/www/blockchain_database.txt";
    fs.writeFile(file_path, blockchain_data, "utf8", function(err) {
        if(err) {
            // return console.log(err);
        }
        else {
            console.log("blockchain file was saved!");
            initBlockchain();//read updated blockchain after new updated were written to database

        }
    });

};


function readBlockchainFromFile() {
    var file_path = "/var/www/blockchain_database.txt";
    var file_data;

    fs.readFile(file_path, "utf8", function (err, data) {
        if (err) {
          // return console.log(err);
        }
        else {
            if (isJsonStringValid(data)) {
                console.log("blockchain file was read successfully1");
                // console.log(data);
                raw_blockchain_data = data;
                file_data = JSON.parse(data);
                io.emit('raw_blockchain_data', raw_blockchain_data);
                blockchain = null;
                blockchain = deserialize(file_data);

            }
            else {
                 console.log("can not read blockchain file1");
            }

             
        }
    });

};

function deserialize(data) {
    var result = [];
    for (var j=0; j<data.length; j++) {

        var blockIndex = data[j]['index'];
        var prevHash = data[j]['previousHash'];
        var timestamp = data[j]['timestamp'];
        var blockData = data[j]['data'];
        var blockHash = data[j]['hash'];
        var blockInChain = new Block(blockIndex, prevHash, timestamp, blockData, blockHash);
        result.push(blockInChain);
    }

    return result;

};

function isJsonStringValid(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
};



