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
                return helper.getTokenByUID(user.uid);
            },
            reason => {
                console.error("Failed to get user by email:", reason);
                def.resolve({isVerified: false, message: 'This user does not exists.'});
            })
        // getTokenByUID
        .then(({token, userUID}) => {
                return sendIdentityVerificationRequest(token, userUID);
            },
            reason => {
                def.resolve({
                    isVerified: false,
                    message: 'This user is not connected to the app. Please connect and try again.'
                });
            })
        // sendIdentityVerificationRequest
        .then(({userUID, verificationUID}) => {
            return obtainIdentityVerification(userUID, verificationUID);
        }, reason => {
            def.resolve({isVerified: true, message: 'User can not get verification message. Please try again.'});
        })
        // obtainIdentityVerification
        .then(({identityVerification, message}) => {
            def.resolve({isVerified: identityVerification, message: message});
        })
        //Unhandled rejection or exception
        .catch(error => {
            console.error('Error in verification:', error);
            def.reject();
        });

    return def.promise;
};

/**
 * Listens for change in the database (IdentityVerifications/{verificationUID}/{userUID}).
 * If there is no change in 2 minutes,
 * listening stops and returned {identityVerification: false, message: 'timeout reached'}
 * @param {string} userUID
 * @param {string} verificationUID
 * @return {JSON} {boolean} identityVerification, {string} massage
 **/
function obtainIdentityVerification(userUID, verificationUID) {
    let def = q.defer();
    console.log(`Waiting for verification from ${userUID}`);
    let timeout = 1000 * 120;
    let verificationRef = admin.database().ref("IdentityVerifications").child(verificationUID);

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
        if (snapshot.key !== userUID) {
            console.log(`Got irrelevant trigger`);
            return;
        }
        clearTimeout(timeoutGuard);
        def.resolve(identityFlag ? {identityVerification: true} : {
            identityVerification: false,
            message: 'Identity was not verified'
        });
        console.log(`Finished handling database change, promise state is ${def.promise.inspect().state}`);
        verificationRef.off();
        verificationRef.child(userUID).remove().then(() => {
            console.log('Verification cleared successfully');
        });
    });
    return def.promise;
}

function sendIdentityVerificationRequest(token, userUID) {
    console.log('Sending verification request to:', token);
    let def = q.defer();
    let verificationUID = admin.database().ref("IdentityVerifications").push().key;
    createVerificationPayload(userUID, verificationUID).then(payload => {
        console.log('Sending:', payload);
        admin.messaging().sendToDevice(token, payload)
            .then(response => {
                console.log('Successfully sent message:', response);
                def.resolve({userUID: userUID, verificationUID: verificationUID});
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

function createVerificationPayload(userUID, verificationUID) {
    let def = q.defer();
    admin.auth().getUser(userUID).then(user => {
        console.log('Creating payload about user:', user.toJSON());
        let payload =
            {
                data: {
                    priority: 'high',
                    messageType: 'identity',
                    userEmail: user.email,
                    userName: user.displayName,
                    userPhotoUrl: user.photoURL,
                    verificationUID: verificationUID
                }
            };
        def.resolve(payload);
    });
    return def.promise;
}
