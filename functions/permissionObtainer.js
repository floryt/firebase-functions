/**
 * Created by Steven on 5/1/2017.
 */

var helper = require('./helper');
const admin = helper.admin;
const q = require('q');


module.exports.obtainPermission= function obtainPermission(email, computerUID) {
    let def = q.defer();

    helper.getUIDByEmail(email).then(userUID => { //TODO handle 'user was not found'
        return helper.getTokenByUID(userUID);
    }).then(({token, userUID}) => { //TODO handle 'token was not found'
        return sendPermissionRequest(token, userUID);
    }).then(({userUID, permissionUID}) => { //TODO handle 'failed to send message'
        return obtainPermissionValue(userUID, permissionUID);
    }).then(({isPermitted, message}) =>{ //TODO handle 'failed to obtain identity verification'
        def.resolve({isPermitted: isPermitted, message: message});
    }).catch(error => {
        console.log("Error in verification: ", error);
        def.reject();
    });


    return def.promise;
};

function obtainPermissionValue(userUID, permissionUID) {

}

function sendPermissionRequest(token, userUID, computerUID) {
    console.log("Sending notification to: ", token);
    let def = q.defer();

    createPermissionRequestPayload(userUID, computerUID).then(payload => {
        console.log("Sending: ", payload);
        admin.messaging().sendToDevice(token, payload)
            .then(response => {
                // See the MessagingDevicesResponse reference documentation for the contents of response.
                console.log("Successfully sent message:", response);
                def.resolve(userUID);
            })
            .catch(error => {
                console.log("Error sending message:", error);
                def.reject();
            });
    });

    return def.promise;
}

function createPermissionRequestPayload(userUID, computerUID) {
    console.log("Creating payload about user: ", userUID);
    let def = q.defer();
    admin.auth().getUser(userUID).then(user => {
        console.log("User: ", user.toJSON());
        console.log(user.displayName, user.email, user.photoURL);
        let payload =
            {
                data: {
                    priority: 'high',
                    userEmail: user.email,
                    userName: user.displayName,
                    userPhotoUrl: user.photoURL,
                    computer: computerUID,
                }
            };
        console.log("Created payload: ", payload);
        def.resolve(payload);
    }).catch(error => {
        console.log("Failed to create payload: ", error);
        def.reject();
    });
    return def.promise;
}