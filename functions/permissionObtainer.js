/**
 * Created by Steven on 5/1/2017.
 */

var helper = require('./helper');
const admin = helper.admin;
const q = require('q');


module.exports.obtainPermission = function obtainPermission(guestEmail, computerUid) {
    let def = q.defer();

    helper.getOwnerByComputer(computerUid)
        .then(ownerUid => {
            return helper.getTokenByUid(ownerUid);
        },
        reason => {
            def.resolve({isVerified: false, message: 'Computer is not registered.'});
        })

        // getTokenByUid
        .then(({token, userUid}) => {
            return sendPermissionRequest(token, guestEmail, computerUid, userUid);
        },
        reason => {
            def.resolve({
                isVerified: false,
                message: 'The computer owner is not available currently. Please try again later.'
            });
        })

        // sendPermissionRequest
        .then(({ownerUid, guestUid, permissionUid}) => {
            return obtainPermissionValue(ownerUid, permissionUid, computerUid, guestUid);
        },
        reason => {
            def.resolve({isVerified: true, message: 'User can not get verification message. Please try again.'});
        })

        // obtainPermissionValue
        .then(({isPermitted, message}) => {
            def.resolve({isPermitted: isPermitted, message: message});
        })

        // Unhandled rejection or exception
        .catch(error => {
            console.error('Error in verification:', error);
            def.reject();
        });


    return def.promise;
};

function obtainPermissionValue(ownerUid, permissionUid, computerUid, guestUid) {
    let def = q.defer();
    console.log(`Waiting for permission from ${ownerUid}, for ${guestUid}`);

    if (ownerUid === guestUid) {  // if guest is owner permit immediately
        def.resolve({isPermitted: true});
        return def.promise;
    }

    let permissionRef = admin.database().ref("Permissions").child(permissionUid).child(computerUid);
    let timeout = 1000 * 120;

    console.log(`Started watchdog on ${permissionRef}, for ${timeout} milliseconds`);
    let timeoutGuard;
    timeoutGuard = setTimeout(() => {
        console.warn('Reached timeout');
        permissionRef.off(); //Remove listener
        def.resolve({isPermitted: false, message: 'Reached timeout'});
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

function sendPermissionRequest(token, guestEmail, computerUid, ownerUid) {
    console.log('Sending notification to:', token);
    let def = q.defer();
    let permissionUid = admin.database().ref("Permissions").push().key;

    createPermissionRequestPayload(guestEmail, computerUid, permissionUid).then(payload => {
        console.log('Sending:', payload);
        admin.messaging().sendToDevice(token, payload)
            .then(response => {
                console.log('Successfully sent message:', response);
                def.resolve({ownerUid: ownerUid, guestUid: payload.data.guestUid, permissionUid: permissionUid});
            })
            .catch(error => {
                console.error('Error sending message:', error);
                def.reject();
            });
    });

    return def.promise;
}

function createPermissionRequestPayload(guestEmail, computerUid, permissionUid) {
    console.log(`Creating payload: ${guestEmail} wants to sign in to ${computerUid}`);
    let def = q.defer();
    admin.auth().getUserByEmail(guestEmail).then(guest => {
        console.log('Guest:', guest.toJSON());
        admin.database().ref('Computers').child(computerUid).on('value', snapshot => {
            let computer = snapshot.val();
            console.log(`Found computer: ${JSON.stringify(computer)}`);
            let payload =
                {
                    data: {
                        priority: 'high',
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
    }).catch(error => {
        console.error('Failed to create payload:', error);
        def.reject();
    });
    return def.promise;
}