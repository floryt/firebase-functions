/**
 * Created by Steven on 5/1/2017.
 */

var helper = require('./helper');
const admin = helper.admin;
const q = require('q');


module.exports.obtainPermission= function obtainPermission(guestEmail, computerUID) {
    let def = q.defer();

    helper.getOwnerByComputer(computerUID).then(ownerUID => { //TODO handle 'user was not found'
        return helper.getTokenByUID(ownerUID); // get owner token
    }).then(({token, userUID}) => { //TODO handle 'token was not found'
        return sendPermissionRequest(token, guestEmail, computerUID, userUID); // send request to owner token, with computer data, and guest user data
    }).then(({ownerUID, guestUID}) => { //TODO handle 'failed to send message'
        return obtainPermissionValue(ownerUID, computerUID, guestUID);
    }).then(({isPermitted, message}) =>{ //TODO handle 'failed to obtain identity verification'
        def.resolve({isPermitted: isPermitted, message: message});
    }).catch(error => {
        console.log("Error in verification: ", error);
        def.reject();
    });


    return def.promise;
};

function obtainPermissionValue(ownerUID, computerUID, guestUID) { //TODO if guest is owner resolve true.
    let def = q.defer();
    console.log(`Waiting for permission from ${ownerUID}, for ${guestUID}`);
    let permissionRef = admin.database().ref("Permissions").child(computerUID);
    let timeout = 1000 * 120;

    console.log(`Started watchdog on ${permissionRef}, for ${timeout} milliseconds`);
    let timeoutGuard;
    timeoutGuard = setTimeout(() => {
        console.log("Reached timeout");
        permissionRef.off(); //Remove listener
        def.resolve({isPermitted: false, message: 'Reached timeout'});
    }, timeout);

    permissionRef.on('child_added', snapshot => {
        let identityFlag = snapshot.val();
        console.log(`Found value: ${snapshot.key}:${identityFlag}`);
        if (snapshot.key !== guestUID){
            console.log(`Got irrelevant trigger`);
            return;
        }
        clearTimeout(timeoutGuard);
        def.resolve(identityFlag? {isPermitted: true} : {isPermitted: false, message: 'Permission denied by owner'});
        permissionRef.off();
        permissionRef.child(guestUID).remove().then(() => {
            console.log('Permission cleared successfully');
        });
    });
    return def.promise;
}

function sendPermissionRequest(token, guestEmail, computerUID, ownerUID) {
    console.log("Sending notification to: ", token);
    let def = q.defer();

    createPermissionRequestPayload(guestEmail, computerUID).then(payload => {
        console.log("Sending: ", payload);
        admin.messaging().sendToDevice(token, payload)
            .then(response => {
                console.log("Successfully sent message:", response);
                def.resolve({ownerUID: ownerUID, guestUID: payload.data.guestUID});
            })
            .catch(error => {
                console.log("Error sending message:", error);
                def.reject();
            });
    });

    return def.promise;
}

function createPermissionRequestPayload(guestEmail, computerUID) {
    console.log(`Creating payload: ${guestEmail} wants to sign in to ${computerUID}`);
    let def = q.defer();
    admin.auth().getUserByEmail(guestEmail).then(guest => {
        console.log("Guest: ", guest.toJSON());
        admin.database().ref('Computers').child(computerUID).on('value', snapshot =>{
            let computer = snapshot.val();
            console.log(`Found computer: ${computer}`);
            let payload =
                {
                    data: {
                        priority: 'high',
                        messageType: 'permission',
                        guestEmail: guest.email,
                        guestName: guest.displayName,
                        guestPhotoUrl: guest.photoURL,
                        guestUID: guest.uid,
                        computerUID: computerUID, // used for retrieving the permission
                        computerName: computer.name
                    }
                };
            console.log("Created payload: ", payload);
            def.resolve(payload);
        });
    }).catch(error => {
        console.log("Failed to create payload: ", error);
        def.reject();
    });
    return def.promise;
}