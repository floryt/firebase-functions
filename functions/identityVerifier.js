/**
 * Created by Steven on 5/1/2017.
 */

var helper = require('./helper');
const admin = helper.admin;
const q = require('q');


module.exports.verifyIdentity = function verifyIdentity(email) {
    let def = q.defer();

    admin.auth().getUserByEmail(email)
        .then(user => {
            return helper.getTokenByUid(user.uid);
        },
        reason => {
            console.error("Failed to get user by email:", reason);
            def.resolve({isVerified: false, message: 'This user does not exists.'});
        })

        // getTokenByUid
        .then(({token, userUid}) => {
            return sendIdentityVerificationRequest(token, userUid);
        },
        reason => {
            def.resolve({
                isVerified: false,
                message: 'This user is not connected to the app. Please connect and try again.'
            });
        })

        // sendIdentityVerificationRequest
        .then(({userUid, verificationUid}) => {
            return obtainIdentityVerification(userUid, verificationUid);
        },
        reason => {
            def.resolve({isVerified: true, message: 'User can not get verification message. Please try again.'});
        })

        // obtainIdentityVerification
        .then(({identityVerification, message}) => {
            def.resolve({isVerified: identityVerification, message: message});
        })

        // Unhandled rejection or exception
        .catch(error => {
            console.error('Error in verification:', error);
            def.reject();
        });

    return def.promise;
};

/**
 * Listens for change in the database (IdentityVerifications/{verificationUid}/{userUid}).
 * If there is no change in 2 minutes,
 * listening stops and returned {identityVerification: false, message: 'timeout reached'}
 * @param {string} userUid
 * @param {string} verificationUid
 * @return {JSON} {boolean} identityVerification, {string} massage
 **/
function obtainIdentityVerification(userUid, verificationUid) {
    let def = q.defer();
    console.log(`Waiting for verification from ${userUid}`);
    let timeout = 1000 * 120;
    let verificationRef = admin.database().ref("IdentityVerifications").child(verificationUid);

    console.log(`Started watchdog on ${verificationRef}, for ${timeout} milliseconds`);
    let timeoutGuard;
    timeoutGuard = setTimeout(() => {
        console.log(`User identity was not verified in a ${timeout / 1000} time frame.`);
        verificationRef.off(); //Remove listener
        def.resolve({
            identityVerification: false,
            message: `User identity was not verified in a ${timeout / 1000} seconds time frame.`
        });
    }, timeout);

    verificationRef.on('child_added', snapshot => {
        let identityFlag = snapshot.val();
        console.log(`Found value: ${snapshot.key}:${identityFlag}`);
        if (snapshot.key !== userUid) {
            console.log(`Got irrelevant trigger`);
            return;
        }
        clearTimeout(timeoutGuard);
        def.resolve(identityFlag ? {identityVerification: true} : {
            identityVerification: false,
            message: 'Identity was not verified'
        });
        verificationRef.off();
        verificationRef.child(userUid).remove().then(() => {
            console.log('Verification cleared successfully');
        });
    });
    return def.promise;
}

function sendIdentityVerificationRequest(token, userUid) {
    console.log('Sending verification request to:', token);
    let def = q.defer();
    let verificationUid = admin.database().ref("IdentityVerifications").push().key;
    createVerificationPayload(userUid, verificationUid).then(payload => {
        console.log('Sending:', payload);
        admin.messaging().sendToDevice(token, payload)
            .then(response => {
                console.log('Successfully sent message:', response);
                def.resolve({userUid: userUid, verificationUid: verificationUid});
            })
            .catch(error => {
                console.error("Error sending message:", error);
                def.reject();
            });
    }).catch(error => {
        console.error("Error creating verification payload:", error);
        def.reject();
    });
    return def.promise;
}

function createVerificationPayload(userUid, verificationUid) {
    let def = q.defer();
    admin.auth().getUser(userUid).then(user => {
        console.log('Creating payload about user:', JSON.stringify(user));
        let payload =
            {
                data: {
                    priority: 'high',
                    messageType: 'identity',
                    userEmail: user.email,
                    userName: user.displayName,
                    userPhotoUrl: user.photoURL,
                    verificationUid: verificationUid
                }
            };
        def.resolve(payload);
    });
    return def.promise;
}
