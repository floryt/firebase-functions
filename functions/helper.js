/**
 * Created by Steven on 5/1/2017.
 */

var functions = require('firebase-functions');
const admin = require('firebase-admin');
const q = require('q');
admin.initializeApp(functions.config().firebase);

module.exports.functions = functions;
module.exports.admin = admin;

module.exports.getTokenByUID = function getTokenByUID(userUID) {
    console.log('Getting token of', userUID);
    let def = q.defer();
    admin.database().ref('Users').child(userUID).child('deviceToken')
        .on('value', snapshot => {
            if (snapshot.val() === null) {
                console.error('User token does not exit.');
                def.reject();
            } else {
                console.error('Got token:', snapshot.val());
                def.resolve({token: snapshot.val(), userUID: userUID});
            }
        });
    return def.promise;
};

module.exports.getOwnerByComputer = function getOwnerByComputer(computerUID) {
    console.log('Getting owner of', computerUID);
    let def = q.defer();
    let ownerUIDRef = admin.database().ref('Computers').child(computerUID).child('ownerUID');
    ownerUIDRef.on('value', snapshot => {
        console.log('Got computer owner:', snapshot.val());
        if (snapshot.val() === null) {
            def.reject();
        }
        else {
            def.resolve(snapshot.val());
        }
    });
    return def.promise;
};