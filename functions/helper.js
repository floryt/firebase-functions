/**
 * Created by Steven on 5/1/2017.
 */

var functions = require('firebase-functions');
const admin = require('firebase-admin');
const q = require('q');
admin.initializeApp(functions.config().firebase);

module.exports.functions = functions;
module.exports.admin = admin;

module.exports.getUIDByEmail = function getUIDByEmail(email) {
    console.log("Getting UID of ", email);
    let def = q.defer();
    admin.auth().getUserByEmail(email)
        .then(userRecored => {
            console.log("Got UID: ", userRecored.uid);
            def.resolve(userRecored.uid);
        }).catch(error => {
        console.log("Error getting UID: ", error);
        def.reject();
    });
    return def.promise;
};

module.exports.getTokenByUID = function getTokenByUID(userUID) {
    console.log("Getting token of ", userUID);
    let def = q.defer();
    if (userUID === undefined) {
        def.reject();
        return def.promise;
    }
    admin.database().ref('Users').child(userUID).child('deviceToken')
        .on('value', snapshot => {
            console.log("Got token: ", snapshot.val());
            def.resolve({token: snapshot.val(), userUID: userUID});
        });
    return def.promise;
};
