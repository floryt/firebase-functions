/**
 * Created by Steven on 5/1/2017.
 */

var functions = require('firebase-functions');
const admin = require('firebase-admin');
const q = require('q');
admin.initializeApp(functions.config().firebase);

module.exports.functions = functions;
module.exports.admin = admin;

module.exports.getTokenByUid = function getTokenByUid(userUid) {
    console.log('Getting token of', userUid);
    let def = q.defer();
    admin.database().ref('Users').child(userUid).child('deviceToken')
        .on('value', snapshot => {
            if (snapshot.val() === null) {
                console.error('User token does not exit.');
                def.reject();
            } else {
                console.log('Got token:', snapshot.val());
                def.resolve(snapshot.val());
            }
        });
    return def.promise;
};

module.exports.getOwnerByComputer = function getOwnerByComputer(computerUid) {
    console.log('Getting owner of', computerUid);
    let def = q.defer();
    let ownerUidRef = admin.database().ref('Computers').child(computerUid).child('ownerUid');
    ownerUidRef.on('value', snapshot => {
        if (snapshot.val() === null) {
            console.error('Computer is not registered.');
            def.reject('Computer is not registered.');
        }
        else {
            console.log('Got computer owner:', snapshot.val());
            def.resolve(snapshot.val());
        }
    });
    return def.promise;
};

module.exports.getIp = function getIp(req){
    return req.headers['x-forwarded-for'] ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.connection.socket.remoteAddress;
};

module.exports.getSnapshot = function getSnapshot(ref) {
    let def = q.defer();
    ref.on('value', def.resolve);
    return def.promise;
};