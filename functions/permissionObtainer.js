/**
 * Created by Steven on 5/1/2017.
 */

var helper = require('./helper');
const admin = helper.admin;
const q = require('q');


module.exports.obtainPermission = function obtainPermission(guestEmail, computerUid) {
    let def = q.defer();
    let ownerUid, guest;

    helper.getOwnerByComputer(computerUid)
        .then(ownerUid_ => {
            ownerUid = ownerUid_;
            return admin.auth().getUserByEmail(guestEmail);
        },
        reason => {
            def.resolve({isPermitted: false, message: reason});
        })

        // getUserByEmail
        .then(guest_ => {
            if (ownerUid === guest_.uid) {  // if guest is owner permit immediately
                def.resolve({isPermitted: true});
            } else {
                guest = guest_;
                return helper.getTokenByUid(ownerUid);
            }
        },
        reason => {
            console.error("Failed to get user by email:", reason);
            def.resolve({isVerified: false, message: 'This user does not exists.'});
        })

        // getTokenByUid
        .then((token) => {
            return sendPermissionRequest(token, guest, computerUid);
        },
        reason => {
            def.resolve({
                isPermitted: false,
                message: 'The computer owner is not available currently. Please try again later.'
            });
        })

        // sendPermissionRequest
        .then(({guestUid, permissionUid}) => {
            return obtainPermissionValue(ownerUid, permissionUid, computerUid, guestUid);
        },
        reason => {
            def.resolve({isPermitted: true, message: reason});
        })

        // obtainPermissionValue
        .then(({isPermitted, message}) => {
            def.resolve({isPermitted: isPermitted, message: message});
        })

        // Unhandled rejection or exception
        .catch(error => {
            console.error('Error in obtaining permission:', error);
            def.reject();
        });


    return def.promise;
};

function obtainPermissionValue(ownerUid, permissionUid, computerUid, guestUid) {
    let def = q.defer();
    console.log(`Waiting for permission from ${ownerUid}, for ${guestUid}`);

    let permissionRef = admin.database().ref("Permissions").child(permissionUid).child(computerUid);
    let timeout = 1000 * 120;

    console.log(`Started watchdog on ${permissionRef}, for ${timeout/1000} seconds`);
    let timeoutGuard;
    timeoutGuard = setTimeout(() => {
        console.warn(`Request was not answered in a ${timeout / 1000} seconds time frame.`);
        permissionRef.off(); //Remove listener
        def.resolve({isPermitted: false, message: `Request was not answered in a ${timeout / 1000} seconds time frame.`});
    }, timeout);

    permissionRef.on('child_added', snapshot => {
        let identityFlag = snapshot.val();
        console.log(`Found value: ${snapshot.key}:${identityFlag}`);
        if (snapshot.key !== guestUid) {
            console.log(`Got irrelevant trigger`);
            return;
        }
        clearTimeout(timeoutGuard);
        def.resolve(identityFlag ? {isPermitted: true} : {isPermitted: false, message: 'Permission denied by owner'});
        permissionRef.off();
        permissionRef.child(guestUid).remove().then(() => {
            console.log('Permission cleared successfully');
        });
    });
    return def.promise;
}

function sendPermissionRequest(token, guest, computerUid) {
    console.log('Sending notification to:', token);
    let def = q.defer();
    let permissionUid = admin.database().ref("Permissions").push().key;

    createPermissionRequestPayload(guest, computerUid, permissionUid).then(payload => {
        console.log('Sending:', payload);
        admin.messaging().sendToDevice(token, payload)
            .then(response => {
                console.log('Successfully sent message:', response);
                def.resolve({guestUid: payload.data.guestUid, permissionUid: permissionUid});
            })
            .catch(error => {
                console.error('Error sending message:', error);
                def.reject('Failed to send request. Please try again.');
            });
    });

    return def.promise;
}

function createPermissionRequestPayload(guest, computerUid, permissionUid) {
    console.log(`Creating payload: ${guest.email} wants to sign in to ${computerUid}`);
    let def = q.defer();

    console.log('Guest:', JSON.stringify(guest));
    admin.database().ref('Computers').child(computerUid).on('value', snapshot => {
        let computer = snapshot.val();
        console.log(`Found computer: ${JSON.stringify(computer)}`);
        let payload =
            {
                // TODO: priority: 'high',
                data: {
                    messageType: 'permission',
                    guestEmail: guest.email,
                    guestName: guest.displayName,
                    guestPhotoUrl: guest.photoURL,
                    guestUid: guest.uid,
                    computerUid: computerUid,
                    computerName: computer.name, //unnecessary
                    permissionUid: permissionUid
                }
            };
        console.log('Created payload:', payload);
        def.resolve(payload);
    });
    return def.promise;
}